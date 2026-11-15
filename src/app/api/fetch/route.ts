import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/cache";
import { extractArxivId, fetchArxivHtml, processPaper, toClientPayload } from "@/lib/paper";
import { recordError, recordPaperLoad } from "@/lib/stats";

// Allow up to 60s for OpenRouter explanation batches (Vercel Hobby caps at
// 10s by default; this export extends it — see vercel.json maxDuration).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim() ?? "";
  const arxivId = extractArxivId(url);
  if (!arxivId) {
    return NextResponse.json(
      { error: "Provide an arXiv URL (e.g. https://arxiv.org/abs/2401.12345)" },
      { status: 400 },
    );
  }

  const cached = await getCached(arxivId);
  if (cached) {
    await recordPaperLoad(arxivId, true);
    return NextResponse.json({ data: cached, cached: true });
  }

  try {
    const html = await fetchArxivHtml(arxivId);
    const data = toClientPayload(await processPaper(arxivId, html));
    await setCached(arxivId, data);
    await recordPaperLoad(arxivId, false);
    return NextResponse.json({ data, cached: false });
  } catch (err) {
    await recordError();
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
