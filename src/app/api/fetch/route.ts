import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/cache";
import { extractArxivId, fetchArxivHtml, processPaper, toClientPayload } from "@/lib/paper";
import { clientIp, fetchLimiter } from "@/lib/ratelimit";
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

function loadPaper(arxivId: string): Promise<ReaderPayload> {
  const existing = inFlight.get(arxivId);
  if (existing) return existing;
  const pending = (async () => {
    const html = await fetchArxivHtml(arxivId);
    const data = toClientPayload(await processPaper(arxivId, html));
    await setCached(arxivId, data);
    return data;
  })();
  inFlight.set(arxivId, pending);
  const cleanup = () => inFlight.delete(arxivId);
  pending.then(cleanup, cleanup);
  return pending;
}

export async function POST(req: NextRequest) {
  let body: { url?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const arxivId = extractArxivId(url);
  if (!arxivId) {
    return NextResponse.json(
      { error: "Provide an arXiv URL (e.g. https://arxiv.org/abs/2401.12345)" },
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

  const cached = await getCached(arxivId);
  if (cached) {
    await recordPaperLoad(arxivId, true);
    return NextResponse.json({ data: cached, cached: true });
  }

  try {
    const data = await loadPaper(arxivId);
    await recordPaperLoad(arxivId, false);
    return NextResponse.json({ data, cached: false });
  } catch (err) {
    await recordError();
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
