import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/cache";
import { PaperHtmlUnavailableError, toClientPayload } from "@/lib/paper";
import { clientIp, fetchLimiter } from "@/lib/ratelimit";
import { loadSourcePaper } from "@/lib/source-loader";
import { parseSourceId, type SourceRef } from "@/lib/sources";
import { recordError, recordPaperLoad } from "@/lib/stats";
import type { ReaderPayload } from "@/lib/types";

// Allow up to 60s for OpenRouter explanation batches (Vercel Hobby caps at
// 10s by default; this export extends it — see vercel.json maxDuration).
export const maxDuration = 60;

/**
 * Collapse concurrent requests for the same paper into one arXiv fetch + LLM
 * run. Without this, N simultaneous requests (easy to trigger) multiply work
 * and cost. Entries are removed as soon as the promise settles.
 */
const inFlight = new Map<string, Promise<ReaderPayload>>();

function loadPaper(ref: SourceRef): Promise<ReaderPayload> {
  const cacheKey = `${ref.source}:${ref.id}`;
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    const data = toClientPayload(await loadSourcePaper(ref));
    await setCached(ref, data);
    return data;
  })();
  inFlight.set(cacheKey, pending);
  const cleanup = () => inFlight.delete(cacheKey);
  pending.then(cleanup, cleanup);
  return pending;
}

export async function POST(req: NextRequest) {
  let body: { source?: unknown; id?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const ref = parseSourceId(source, id);
  if (!ref) {
    return NextResponse.json(
      { error: "Unsupported paper source or identifier" },
      { status: 400 },
    );
  }

  if (fetchLimiter) {
    try {
      const { success, reset } = await fetchLimiter.limit(clientIp(req));
      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please wait a minute and try again." },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
              ),
            },
          },
        );
      }
    } catch (err) {
      // Never let a limiter outage take down the reader.
      console.warn("Rate limit check failed (allowing request):", err);
    }
  }

  const cached = await getCached(ref);
  if (cached) {
    await recordPaperLoad(ref, true);
    return NextResponse.json({ data: cached, cached: true });
  }

  try {
    const data = await loadPaper(ref);
    await recordPaperLoad(ref, false);
    return NextResponse.json({ data, cached: false });
  } catch (err) {
    await recordError();
    const message = err instanceof Error ? err.message : "Unexpected error";
    if (err instanceof PaperHtmlUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message,
            docUrl: err.docUrl,
            arxivId: err.arxivId,
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
