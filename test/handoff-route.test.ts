import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET } from "@/app/api/handoff/[slug]/route";
import {
  createHandoff,
  resetHandoffMemoryForTests,
} from "@/lib/handoff";
import { publisherIdFor } from "@/lib/publish-auth";
import type { ReaderPayload } from "@/lib/types";

function payload(): ReaderPayload {
  return {
    source: "arxiv",
    sourceId: "2401.01234",
    title: "A Test Paper",
    authors: ["Ada Lovelace"],
    paragraphs: [{ id: "p1", html: "Hello", mathTex: [] }],
    figures: [],
    paraFigureMap: {},
    provenance: "byom",
    format: "pdf",
  };
}

function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function request(token?: string): NextRequest {
  return new NextRequest("http://localhost/api/handoff", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  resetHandoffMemoryForTests();
  process.env.PUBLISH_TOKENS = "test-token,other-token";
  delete process.env.ADMIN_TOKEN;
});

afterEach(() => {
  delete process.env.PUBLISH_TOKENS;
  delete process.env.ADMIN_TOKEN;
});

describe("handoff routes", () => {
  it("returns a payload with no-store headers", async () => {
    const created = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("test-token"),
      payload: payload(),
    });

    const res = await GET(request(), context(created.record.slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const body = (await res.json()) as {
      data: ReaderPayload;
      provenance: string;
      arxivId: string;
    };
    expect(body.arxivId).toBe("2401.01234");
    expect(body.provenance).toBe("byom");
    expect(body.data.title).toBe("A Test Paper");
  });

  it("returns 410 for unknown and expired slugs", async () => {
    const res = await GET(request(), context("a".repeat(24)));
    expect(res.status).toBe(410);

    const invalid = await GET(request(), context("short"));
    expect(invalid.status).toBe(404);
  });

  it("enforces ownership and admin tokens on delete", async () => {
    const created = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("test-token"),
      payload: payload(),
    });

    const stranger = await DELETE(
      request("other-token"),
      context(created.record.slug),
    );
    expect(stranger.status).toBe(403);
    const stillThere = await GET(request(), context(created.record.slug));
    expect(stillThere.status).toBe(200);

    const owner = await DELETE(
      request("test-token"),
      context(created.record.slug),
    );
    expect(owner.status).toBe(204);

    const gone = await GET(request(), context(created.record.slug));
    expect(gone.status).toBe(410);
  });

  it("lets an admin delete any handoff", async () => {
    process.env.ADMIN_TOKEN = "admin-token";
    const created = await createHandoff({
      arxivId: "2401.01234",
      publisherId: publisherIdFor("test-token"),
      payload: payload(),
    });

    const res = await DELETE(
      request("admin-token"),
      context(created.record.slug),
    );
    expect(res.status).toBe(204);
  });
});
