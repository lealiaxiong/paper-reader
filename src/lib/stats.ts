import type { Redis } from "@upstash/redis";
import type { SourceRef } from "./sources";
import { redis } from "./redis";

const DAY_SECONDS = 86_400;
const DAYS_RETAINED = 400;

function utcDay(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * DAY_SECONDS * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Usage counters are written only on production deployments, so local dev
 * and previews don't pollute real numbers. Failures never affect requests.
 */
function productionClient(): Redis | null {
  return process.env.VERCEL_ENV === "production" ? redis : null;
}

export async function recordPaperLoad(
  ref: SourceRef,
  cacheHit: boolean,
): Promise<void> {
  const client = productionClient();
  if (!client) return;
  const day = utcDay();
  try {
    await client
      .pipeline()
      .incr(`stats:loads:${day}`)
      .incr(cacheHit ? "stats:cache:hits" : "stats:cache:misses")
      .hincrby("stats:papers", `${ref.source}:${ref.id}`, 1)
      .expire(`stats:loads:${day}`, DAYS_RETAINED * DAY_SECONDS)
      .exec();
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}

export async function recordError(): Promise<void> {
  const client = productionClient();
  if (!client) return;
  try {
    await client.incr("stats:errors");
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}

/**
 * BYOM counters (M9 slice). Cumulative like the cache counters; production-only
 * via `productionClient()`. Key names are stable because `/api/stats` reads
 * them by exact key.
 */
export async function recordByomPublish(ok: boolean): Promise<void> {
  const client = productionClient();
  if (!client) return;
  try {
    await client.incr(ok ? "stats:byom:publish:ok" : "stats:byom:publish:fail");
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}

export async function recordSanitizeRejection(): Promise<void> {
  const client = productionClient();
  if (!client) return;
  try {
    await client.incr("stats:byom:sanitize-rejections");
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}

export async function recordHandoffHit(): Promise<void> {
  const client = productionClient();
  if (!client) return;
  try {
    await client.incr("stats:byom:handoff-hits");
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}

export async function recordHandoffExpired(): Promise<void> {
  const client = productionClient();
  if (!client) return;
  try {
    await client.incr("stats:byom:handoff-expired");
  } catch (err) {
    console.warn("Stats write failed:", err);
  }
}
