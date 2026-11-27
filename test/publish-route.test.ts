import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/publish/route";
import { resetHandoffMemoryForTests } from "@/lib/handoff";

function input(overrides: Record<string, unknown> = {}) {
  return {
    arxivId: "2401.01234",
    title: "A Test Paper",
    authors: ["Ada Lovelace"],
    paragraphs: [
      {
        id: "p1",
        text: "We show results in Figure 1.",
        html: "We show results in <b>Figure 1</b>.",
        mathTex: [],
      },
    ],
    figures: [
      {
        id: "f1",
        label: "Figure 1",
        number: 1,
        kind: "figure",
        caption: "Figure 1: Results.",
        pdfPage: 2,
        bbox: [0.1, 0.2, 0.5, 0.4],
      },
    ],
    ...overrides,
  };
}

function atom(title = "A Test Paper"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>${title}</title>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
  </entry>
</feed>`;
}

function mockUpstream(options: { html?: boolean; title?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: RequestInfo | URL) => {
      const url =
        typeof value === "string"
          ? value
          : value instanceof URL
            ? value.href
            : value.url;

      if (
        url.startsWith("https://arxiv.org/html/") ||
        url.startsWith("https://ar5iv.arxiv.org/html/")
      ) {
        return options.html
          ? new Response(
              '<html><body><article class="ltx_document">paper</article></body></html>',
              {
                status: 200,
                headers: { "content-type": "text/html; charset=utf-8" },
              },
            )
          : new Response("", { status: 404 });
      }

      if (url.startsWith("https://export.arxiv.org/api/query")) {
        return new Response(atom(options.title), {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function publishRequest(
  body: unknown = input(),
  token = "test-token",
): NextRequest {
  return new NextRequest("http://localhost/api/publish", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetHandoffMemoryForTests();
  process.env.PUBLISH_TOKENS = "test-token";
  delete process.env.PAPER_READER_TOKEN;
  delete process.env.ADMIN_TOKEN;
  delete process.env.HANDOFF_TTL_SECONDS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUBLISH_TOKENS;
  delete process.env.HANDOFF_TTL_SECONDS;
});

describe("POST /api/publish", () => {
  it("rejects missing or wrong tokens", async () => {
    mockUpstream();
    const missing = await POST(
      new NextRequest("http://localhost/api/publish", {
        method: "POST",
        body: JSON.stringify(input()),
      }),
    );
    expect(missing.status).toBe(401);

    const wrong = await POST(publishRequest(input(), "wrong"));
    expect(wrong.status).toBe(401);
  });

  it("creates a handoff and dedupes a retry", async () => {
    mockUpstream();
    const first = await POST(publishRequest());
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      slug: string;
      url: string;
      deduped: boolean;
    };
    expect(firstBody.url).toContain(`?h=${firstBody.slug}`);
    expect(firstBody.deduped).toBe(false);

    const second = await POST(publishRequest());
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      slug: string;
      deduped: boolean;
    };
    expect(secondBody.slug).toBe(firstBody.slug);
    expect(secondBody.deduped).toBe(true);
  });

  it("refuses when deterministic HTML exists", async () => {
    mockUpstream({ html: true });
    const res = await POST(publishRequest());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("HTML_AVAILABLE");
  });

  it("rejects a metadata mismatch", async () => {
    mockUpstream({ title: "A Different Paper" });
    const res = await POST(publishRequest());
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ARXIV_METADATA_MISMATCH");
  });

  it("validates JSON, schema, and arxivId", async () => {
    mockUpstream();

    const badJson = await POST(publishRequest("{"));
    expect(badJson.status).toBe(400);

    const badId = await POST(
      publishRequest(input({ arxivId: "not-an-id" })),
    );
    expect(badId.status).toBe(422);

    const extraKey = await POST(
      publishRequest(input({ unexpected: true })),
    );
    expect(extraKey.status).toBe(400);
  });

  it("enforces the payload size cap", async () => {
    mockUpstream();
    const huge = JSON.stringify({
      ...input(),
      title: "x".repeat(2 * 1024 * 1024 + 10),
    });
    const res = await POST(publishRequest(huge));
    expect(res.status).toBe(413);
  });
});
