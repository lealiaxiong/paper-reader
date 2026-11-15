import type { ReaderPayload } from "./types";
import { redis } from "./redis";

/**
 * Bump when the payload shape or extraction logic changes, so the durable
 * cache never serves stale entries across deploys.
 */
const CACHE_VERSION = "v1";

const CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Per-instance fallback when Redis is not configured (local dev, tests). */
const memory = new Map<string, ReaderPayload>();

function key(arxivId: string): string {
  return `paper:${CACHE_VERSION}:${arxivId}`;
}

/**
 * Shared cache keyed by arXiv ID (not URL) so /abs/..., /html/..., and
 * /pdf/... for the same paper share one entry. Backed by Upstash Redis when
 * configured; otherwise falls back to an in-memory Map.
 */
export async function getCached(
  arxivId: string,
): Promise<ReaderPayload | undefined> {
  if (!redis) return memory.get(key(arxivId));
  try {
    return (await redis.get<ReaderPayload>(key(arxivId))) ?? undefined;
  } catch (err) {
    console.warn("Redis GET failed, treating as cache miss:", err);
    return memory.get(key(arxivId));
  }
}

export async function setCached(
  arxivId: string,
  data: ReaderPayload,
): Promise<void> {
  memory.set(key(arxivId), data);
  if (!redis) return;
  try {
    await redis.set(key(arxivId), data, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("Redis SET failed (response still served):", err);
  }
}
