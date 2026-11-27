import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createHandoff,
  deleteHandoff,
  getHandoff,
  handoffTtlSeconds,
  resetHandoffMemoryForTests,
  SLUG_PATTERN,
} from "@/lib/handoff";
import {
  PublishPayloadError,
  buildHandoffPayload,
} from "@/lib/handoff-payload";
import {
  authenticatePublisher,
  isAdminRequest,
  publisherIdFor,
} from "@/lib/publish-auth";
import {
  metadataMatches,
  titleSimilarity,
} from "@/lib/arxiv-metadata";
import type { ReaderPayload } from "@/lib/types";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    arxivId: "2401.01234",
    title: "A Test Paper",
    authors: ["Ada Lovelace"],
    paragraphs: [
      {
        id: "p1",
        text: "We show results in Figure 1.",
        html: "<p>We show results in <b>Figure 1</b>.</p><script>alert(1)</script>",
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

function readerPayload(title = "A Test Paper"): ReaderPayload {
  return {
    source: "arxiv",
    sourceId: "2401.01234",
    title,
    authors: ["Ada Lovelace"],
    paragraphs: [{ id: "p1", html: "<b>Hello</b>", mathTex: [] }],
    figures: [],
    paraFigureMap: {},
  };
}

beforeEach(() => {
  resetHandoffMemoryForTests();
  vi.useRealTimers();
  process.env.PUBLISH_TOKENS = "test-token";
  delete process.env.PAPER_READER_TOKEN;
  delete process.env.ADMIN_TOKEN;
  delete process.env.HANDOFF_TTL_SECONDS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.PUBLISH_TOKENS;
  delete process.env.HANDOFF_TTL_SECONDS;
});

describe("buildHandoffPayload", () => {
  it("sanitizes HTML, strips paragraph text, and recomputes the figure map", () => {
    const built = buildHandoffPayload(validInput());

    expect(built.payload.provenance).toBe("byom");
    expect(built.payload.format).toBe("pdf");
    expect(built.payload.paraFigureMap).toEqual({ p1: ["f1"] });
    expect(built.payload.paragraphs[0].html).not.toContain("script");
    expect(built.payload.paragraphs[0].html).toContain("Figure 1");
    expect(
      (built.payload.paragraphs[0] as { text?: string }).text,
    ).toBeUndefined();
  });

  it("sanitizes table HTML and keeps a caption-only fallback impossible", () => {
    const built = buildHandoffPayload(
      validInput({
        figures: [
          {
            id: "f1",
            label: "Table 1",
            number: 1,
            kind: "table",
            caption: "Table 1: Results.",
            tableHtml:
              "<table><tr><td>1</td></tr><script>alert(1)</script></table>",
          },
        ],
      }),
    );

    expect(built.payload.figures[0].tableHtml).not.toContain("script");
    expect(built.payload.figures[0].tableHtml).toContain("<td>1</td>");
  });

  it("rejects imageUrl figures", () => {
    expect(() =>
      buildHandoffPayload(
        validInput({
          figures: [
            {
              id: "f1",
              label: "Figure 1",
              number: 1,
              kind: "figure",
              caption: "Figure 1: Results.",
              imageUrl: "https://example.com/f1.png",
            },
          ],
        }),
      ),
    ).toThrowError(PublishPayloadError);
  });

  it("rejects a bbox without a pdfPage", () => {
    expect(() =>
      buildHandoffPayload(
        validInput({
          figures: [
            {
              id: "f1",
              label: "Figure 1",
              number: 1,
              kind: "figure",
              caption: "Figure 1: Results.",
              bbox: [0.1, 0.2, 0.5, 0.4],
            },
          ],
        }),
      ),
    ).toThrowError(/bbox but no pdfPage/);
  });

  it("rejects out-of-bounds bboxes and duplicate ids", () => {
    expect(() =>
      buildHandoffPayload(
        validInput({
          figures: [
            {
              id: "f1",
              label: "Figure 1",
              number: 1,
              kind: "figure",
              caption: "Figure 1: Results.",
              pdfPage: 1,
              bbox: [0.8, 0.2, 0.5, 0.4],
            },
          ],
        }),
      ),
    ).toThrowError(PublishPayloadError);

    expect(() =>
      buildHandoffPayload(
        validInput({
          paragraphs: [
            { id: "p1", text: "One", html: "One", mathTex: [] },
            { id: "p1", text: "Two", html: "Two", mathTex: [] },
          ],
        }),
      ),
    ).toThrowError(/Duplicate paragraph/);
  });

  it("keeps a model map only where regex has no match", () => {
    const built = buildHandoffPayload(
      validInput({
        paragraphs: [
          { id: "p1", text: "See the chart below.", html: "See the chart below.", mathTex: [] },
          { id: "p2", text: "Figure 1 shows it.", html: "Figure 1 shows it.", mathTex: [] },
        ],
        paraFigureMap: { p1: ["f1"], p2: ["f1"] },
      }),
    );

    expect(built.payload.paraFigureMap).toEqual({ p1: ["f1"], p2: ["f1"] });
  });
});

describe("handoff store", () => {
  it("creates, reads, and deletes an unguessable record", async () => {
    const created = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("test-token"),
      payload: readerPayload(),
    });

    expect(created.deduped).toBe(false);
    expect(created.record.slug).toMatch(SLUG_PATTERN);

    const found = await getHandoff(created.record.slug);
    expect(found?.arxivId).toBe("2401.01234");

    const deleted = await deleteHandoff(created.record.slug);
    expect(deleted?.slug).toBe(created.record.slug);
    expect(await getHandoff(created.record.slug)).toBeUndefined();
  });

  it("dedupes per publisher, not globally", async () => {
    const payload = readerPayload();
    const first = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("token-a"),
      payload,
    });
    const retry = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("token-a"),
      payload,
    });
    const other = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("token-b"),
      payload,
    });

    expect(retry.deduped).toBe(true);
    expect(retry.record.slug).toBe(first.record.slug);
    expect(other.record.slug).not.toBe(first.record.slug);
  });

  it("expires records after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const created = await createHandoff({
      arxivId: "2401.01234",
      publisherId: "publisher",
      payload: readerPayload(),
    });

    vi.setSystemTime(new Date("2026-01-01T06:00:01Z"));
    expect(await getHandoff(created.record.slug)).toBeUndefined();
  });

  it("clamps the TTL between one and 24 hours", () => {
    expect(handoffTtlSeconds(undefined)).toBe(6 * 60 * 60);
    expect(handoffTtlSeconds("60")).toBe(60 * 60);
    expect(handoffTtlSeconds("999999")).toBe(24 * 60 * 60);
  });
});

describe("publish auth", () => {
  function request(authorization?: string): NextRequest {
    return new NextRequest("http://localhost/api/publish", {
      headers: authorization ? { authorization } : {},
    });
  }

  it("accepts a configured publisher token and derives an id", () => {
    const auth = authenticatePublisher(request("Bearer test-token"));
    expect(auth?.publisherId).toBe(publisherIdFor("test-token"));
  });

  it("rejects missing, wrong, and admin tokens as publishers", () => {
    expect(authenticatePublisher(request())).toBeNull();
    expect(authenticatePublisher(request("Bearer nope"))).toBeNull();
    process.env.ADMIN_TOKEN = "admin-token";
    expect(authenticatePublisher(request("Bearer admin-token"))).toBeNull();
    expect(isAdminRequest(request("Bearer admin-token"))).toBe(true);
  });
});

describe("arXiv metadata matching", () => {
  const metadata = {
    title: "A Test Paper",
    authors: ["Ada Lovelace", "Alan Turing"],
  };

  it("matches titles with punctuation and math stripped", () => {
    expect(titleSimilarity("A Test Paper!", "A test paper")).toBe(1);
    expect(
      metadataMatches(
        { title: "A Test Paper", authors: ["Lovelace, Ada"] },
        metadata,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a different title or author", () => {
    expect(
      metadataMatches({ title: "Another Paper", authors: ["Ada Lovelace"] }, metadata),
    ).toEqual({ ok: false, reason: "title" });
    expect(
      metadataMatches({ title: "A Test Paper", authors: ["Grace Hopper"] }, metadata),
    ).toEqual({ ok: false, reason: "authors" });
  });
});
