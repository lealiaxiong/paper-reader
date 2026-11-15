import type { ReaderPayload } from "./types";

/**
 * Bump when the payload shape or extraction logic changes, so durable caches
 * (e.g. a future Redis store) never serve stale entries across deploys.
 */
const CACHE_VERSION = "v1";

/**
 * In-memory cache keyed by arXiv ID (not URL) so that
 * /abs/..., /html/..., and /pdf/... for the same paper share one entry.
 * Clears on server restart; fine for a local demo.
 */
const cache = new Map<string, ReaderPayload>();

function key(arxivId: string): string {
  return `${CACHE_VERSION}:${arxivId}`;
}

export function getCached(arxivId: string): ReaderPayload | undefined {
  return cache.get(key(arxivId));
}

export function setCached(arxivId: string, data: ReaderPayload): void {
  cache.set(key(arxivId), data);
}
