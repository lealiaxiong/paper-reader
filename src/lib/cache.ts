import type { SourceRef } from "./sources";
import type { ReaderPayload } from "./types";
import { redis } from "./redis";

/**
 * Bump when the payload shape or extraction logic changes, so the durable
 * cache never serves stale entries across deploys. v3 adds source-aware
 * paper references, so v2 entries cannot be reused.
 */
const CACHE_VERSION = "v3";

const CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Per-instance fallback when Redis is not configured (local dev, tests). */
const memory = new Map<string, ReaderPayload>();

function key(ref: SourceRef): string {
  return `paper:${CACHE_VERSION}:${ref.source}:${ref.id}`;
}

/**
 * Shared cache keyed by source + canonical paper ID (not URL), so aliases
 * for the same paper share one entry. Backed by Upstash Redis when
 * configured; otherwise falls back to an in-memory Map.
 */
export async function getCached(
  ref: SourceRef,
): Promise<ReaderPayload | undefined> {
  if (!redis) return memory.get(key(ref));
  try {
    return (await redis.get<ReaderPayload>(key(ref))) ?? undefined;
  } catch (err) {
    console.warn("Redis GET failed, treating as cache miss:", err);
    return memory.get(key(ref));
  }
}

export async function setCached(
  ref: SourceRef,
  data: ReaderPayload,
): Promise<void> {
  // Only populate the process-local map when it is the actual cache backend;
  // otherwise it would grow unbounded alongside Redis (and keep serving
  // entries after a version bump in the same process).
  if (!redis) {
    memory.set(key(ref), data);
    return;
  }
  try {
    await redis.set(key(ref), data, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("Redis SET failed (response still served):", err);
  }
}
