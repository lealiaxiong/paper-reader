import { createHash, randomBytes } from "node:crypto";
import { redis } from "./redis";
import type { ReaderPayload } from "./types";

const HANDOFF_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const MIN_TTL_SECONDS = 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;

export interface HandoffClient {
  name?: string;
  model?: string;
  skillVersion?: string;
}

export interface HandoffRecord {
  version: 1;
  slug: string;
  arxivId: string;
  publisherId: string;
  payload: ReaderPayload;
  provenance: "byom";
  createdAt: number;
  expiresAt: number;
  contentHash: string;
  client?: HandoffClient;
}

export interface CreateHandoffInput {
  arxivId: string;
  publisherId: string;
  payload: ReaderPayload;
  client?: HandoffClient;
}

export interface CreateHandoffResult {
  record: HandoffRecord;
  deduped: boolean;
}

export class HandoffStorageError extends Error {}

/** Per-instance fallback when Redis is not configured (local dev, tests). */
const memory = new Map<string, HandoffRecord>();
const memoryDedupe = new Map<string, string>();

/** Serializes concurrent creates for the same dedupe key within one instance. */
const inFlight = new Map<string, Promise<CreateHandoffResult>>();

function recordKey(slug: string): string {
  return `handoff:${HANDOFF_VERSION}:${slug}`;
}

function dedupeKey(
  publisherId: string,
  arxivId: string,
  contentHash: string,
): string {
  return `handoff:${HANDOFF_VERSION}:dedupe:${publisherId}:${arxivId}:${contentHash}`;
}

export function handoffTtlSeconds(
  raw = process.env.HANDOFF_TTL_SECONDS,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(parsed)));
}

export function newSlug(): string {
  return randomBytes(18).toString("base64url");
}

/** Stable JSON so the same content maps to the same hash regardless of key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function contentHash(payload: ReaderPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function isExpired(record: HandoffRecord, now = Date.now()): boolean {
  return record.expiresAt <= now;
}

function pruneMemory(now = Date.now()): void {
  for (const [slug, record] of memory) {
    if (isExpired(record, now)) {
      memory.delete(slug);
      memoryDedupe.delete(dedupeKeyOf(record));
    }
  }
}

function dedupeKeyOf(record: HandoffRecord): string {
  return dedupeKey(record.publisherId, record.arxivId, record.contentHash);
}

async function findDeduped(
  publisherId: string,
  arxivId: string,
  hash: string,
): Promise<HandoffRecord | null> {
  if (!redis) {
    pruneMemory();
    const slug = memoryDedupe.get(dedupeKey(publisherId, arxivId, hash));
    if (!slug) return null;
    const record = memory.get(slug);
    if (!record || isExpired(record)) {
      memoryDedupe.delete(dedupeKey(publisherId, arxivId, hash));
      return null;
    }
    return record;
  }

  try {
    const slug = await redis.get<string>(
      dedupeKey(publisherId, arxivId, hash),
    );
    if (!slug) return null;
    const record = await redis.get<HandoffRecord>(recordKey(slug));
    return record ?? null;
  } catch (err) {
    throw new HandoffStorageError("Handoff lookup failed", { cause: err });
  }
}

export async function createHandoff(
  input: CreateHandoffInput,
): Promise<CreateHandoffResult> {
  const hash = contentHash(input.payload);
  const key = dedupeKey(input.publisherId, input.arxivId, hash);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = createHandoffOnce(input, hash, key);
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

async function createHandoffOnce(
  input: CreateHandoffInput,
  hash: string,
  key: string,
): Promise<CreateHandoffResult> {
  const existing = await findDeduped(
    input.publisherId,
    input.arxivId,
    hash,
  );
  if (existing) return { record: existing, deduped: true };

  const now = Date.now();
  const ttl = handoffTtlSeconds();
  const slug = newSlug();
  const record: HandoffRecord = {
    version: 1,
    slug,
    arxivId: input.arxivId,
    publisherId: input.publisherId,
    payload: input.payload,
    provenance: "byom",
    createdAt: now,
    expiresAt: now + ttl * 1000,
    contentHash: hash,
    ...(input.client ? { client: input.client } : {}),
  };

  if (!redis) {
    memory.set(slug, record);
    memoryDedupe.set(key, slug);
    return { record, deduped: false };
  }

  try {
    await redis.set(recordKey(slug), record, { ex: ttl });

    const claimed = await redis.set(key, slug, { nx: true, ex: ttl });
    if (claimed !== null) {
      return { record, deduped: false };
    }

    const winnerSlug = await redis.get<string>(key);
    const winner = winnerSlug
      ? await redis.get<HandoffRecord>(recordKey(winnerSlug))
      : null;
    await redis.del(recordKey(slug));
    if (winner) return { record: winner, deduped: true };

    await redis.del(key);
    const retried = await redis.set(key, slug, { nx: true, ex: ttl });
    if (retried !== null) {
      await redis.set(recordKey(slug), record, { ex: ttl });
      return { record, deduped: false };
    }

    throw new HandoffStorageError("Handoff dedupe claim failed");
  } catch (err) {
    if (err instanceof HandoffStorageError) throw err;
    throw new HandoffStorageError("Handoff write failed", { cause: err });
  }
}

export async function getHandoff(
  slug: string,
): Promise<HandoffRecord | undefined> {
  if (!redis) {
    pruneMemory();
    return memory.get(slug);
  }

  try {
    const record = await redis.get<HandoffRecord>(recordKey(slug));
    return record ?? undefined;
  } catch (err) {
    throw new HandoffStorageError("Handoff read failed", { cause: err });
  }
}

/** Returns the deleted record so callers can verify ownership. */
export async function deleteHandoff(
  slug: string,
): Promise<HandoffRecord | undefined> {
  const record = await getHandoff(slug);
  if (!record) return undefined;

  if (!redis) {
    memory.delete(slug);
    memoryDedupe.delete(dedupeKeyOf(record));
    return record;
  }

  try {
    await redis.del(recordKey(slug));
    await redis.del(dedupeKeyOf(record));
  } catch (err) {
    throw new HandoffStorageError("Handoff delete failed", { cause: err });
  }
  return record;
}

/** Test-only: clear the process-local store. */
export function resetHandoffMemoryForTests(): void {
  memory.clear();
  memoryDedupe.clear();
}
