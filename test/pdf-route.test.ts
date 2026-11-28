import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/pdf/arxiv/[id]/route";

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pdfResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(body.length),
    },
  });
}

function request(id: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/pdf/arxiv/${id}`, {
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/pdf/arxiv/<id>", () => {
  it("rejects an invalid arXiv id", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);

    const res = await GET(request("notanid"), context("notanid"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PDF_NOT_FOUND");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("proxies a valid PDF with caching headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => pdfResponse("%PDF-1.7 fake-bytes")),
    );

    const res = await GET(request("2401.00001"), context("2401.00001"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    const text = await res.text();
    expect(text.startsWith("%PDF-")).toBe(true);
  });

  it("rejects a non-PDF content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    const res = await GET(request("2401.00001"), context("2401.00001"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PDF_UNAVAILABLE");
  });

  it("rejects a declared PDF larger than the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("%PDF-", {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-length": String(21 * 1024 * 1024),
            },
          }),
      ),
    );

    const res = await GET(request("2401.00001"), context("2401.00001"));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PDF_TOO_LARGE");
  });

  it("maps upstream failures to PDF_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );

    const res = await GET(request("2401.00001"), context("2401.00001"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PDF_UNAVAILABLE");
  });
});
