import { Ratelimit } from "@upstash/ratelimit";
import type { NextRequest } from "next/server";
import { redis } from "./redis";

/**
 * Per-IP rate limit for /api/fetch. Each request triggers an arXiv fetch and
 * (when enabled) paid model calls, so unlimited access is an abuse vector.
 * 20 requests/minute comfortably covers normal reading; falls back to no
 * limiting only when Redis is not configured (local dev, tests).
 */
export const fetchLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: `ratelimit:${process.env.VERCEL_ENV ?? "local"}:fetch`,
    })
  : null;

/** Client IP behind the Vercel proxy, with conservative fallbacks. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
