import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

/**
 * Usage counters written by /api/fetch on production deployments.
 * Protected by STATS_TOKEN: `Authorization: Bearer <token>` or `?token=`.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.STATS_TOKEN;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("token") ??
    "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!redis) {
    return NextResponse.json(
      { error: "Redis is not configured" },
      { status: 503 },
    );
  }

  const requestedDays = Number.parseInt(
    req.nextUrl.searchParams.get("days") ?? "14",
    10,
  );
  const days = Math.min(
    Math.max(Number.isFinite(requestedDays) ? requestedDays : 14, 1),
    MAX_DAYS,
  );
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10),
  );

  const [loads, papers, cacheHits, cacheMisses, errors] = await Promise.all([
    redis.mget<(number | null)[]>(...dates.map((d) => `stats:loads:${d}`)),
    redis.hgetall<Record<string, unknown>>("stats:papers"),
    redis.get<number>("stats:cache:hits"),
    redis.get<number>("stats:cache:misses"),
    redis.get<number>("stats:errors"),
  ]);

  const loadsByDay = dates.map((date, i) => ({
    date,
    loads: Number(loads[i] ?? 0),
  }));
  const hits = Number(cacheHits ?? 0);
  const misses = Number(cacheMisses ?? 0);
  const topPapers = Object.entries(papers ?? {})
    .map(([arxivId, count]) => ({ arxivId, loads: Number(count) }))
    .sort((a, b) => b.loads - a.loads)
    .slice(0, 20);

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    days,
    loadsByDay,
    totalLoads: loadsByDay.reduce((n, d) => n + d.loads, 0),
    cache: {
      hits,
      misses,
      hitRate: hits + misses > 0 ? hits / (hits + misses) : null,
    },
    errors: Number(errors ?? 0),
    topPapers,
  });
}
