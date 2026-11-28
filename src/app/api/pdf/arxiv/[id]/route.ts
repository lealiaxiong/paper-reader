import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { parseSourceId } from "@/lib/sources";

// Proxy the public arXiv PDF for client-side figure crops. No bytes are
// persisted; the reader never depends on this to render text.
export const maxDuration = 30;

const MAX_BYTES = 20 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const CACHE = { "Cache-Control": "public, max-age=3600" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ref = parseSourceId("arxiv", id);
  if (!ref) {
    return apiError(404, "PDF_NOT_FOUND", "That arXiv paper does not exist.");
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(`https://arxiv.org/pdf/${ref.id}`, {
      headers: {
        "User-Agent": "paper-reader/0.1 (arXiv PDF reader)",
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return apiError(
      502,
      "PDF_UNAVAILABLE",
      "The PDF could not be fetched from arXiv.",
      undefined,
      CACHE,
    );
  }

  if (upstream.status === 206 && range) {
    const body = await capBody(upstream, MAX_BYTES);
    if (!body) {
      return apiError(
        502,
        "PDF_TOO_LARGE",
        "The requested PDF range is too large.",
        undefined,
        CACHE,
      );
    }
    return new NextResponse(body, {
      status: 206,
      headers: {
        ...CACHE,
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        ...(upstream.headers.get("content-range")
          ? {
              "Content-Range": upstream.headers.get("content-range") as string,
            }
          : {}),
        ...(upstream.headers.get("content-length")
          ? {
              "Content-Length": upstream.headers.get("content-length") as string,
            }
          : {}),
      },
    });
  }

  if (!upstream.ok) {
    return apiError(
      502,
      "PDF_UNAVAILABLE",
      "The PDF could not be fetched from arXiv.",
      undefined,
      CACHE,
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    await upstream.body?.cancel();
    return apiError(
      502,
      "PDF_UNAVAILABLE",
      "arXiv did not return a PDF for this paper.",
      undefined,
      CACHE,
    );
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    await upstream.body?.cancel();
    return apiError(
      413,
      "PDF_TOO_LARGE",
      "This PDF is too large to stream.",
      undefined,
      CACHE,
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await upstream.arrayBuffer();
  } catch {
    return apiError(
      502,
      "PDF_UNAVAILABLE",
      "The PDF could not be read from arXiv.",
      undefined,
      CACHE,
    );
  }

  if (buffer.byteLength > MAX_BYTES) {
    return apiError(
      413,
      "PDF_TOO_LARGE",
      "This PDF is too large to stream.",
      undefined,
      CACHE,
    );
  }

  if (!startsWithPdfMagic(buffer)) {
    return apiError(
      502,
      "PDF_UNAVAILABLE",
      "arXiv did not return a valid PDF for this paper.",
      undefined,
      CACHE,
    );
  }

  return new NextResponse(buffer, {
    headers: {
      ...CACHE,
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

function startsWithPdfMagic(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
  return (
    bytes.length === 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/** Stream an upstream body with a byte cap; returns null if the cap is exceeded. */
async function capBody(
  upstream: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  if (!upstream.body) return null;
  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}
