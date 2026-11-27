import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXAMPLE,
  SCHEMA,
  configFromEnv,
  formatPaperFormat,
  publishPaper,
} from "../mcp/src/publish";

function fakeFetch(response: unknown, status = 201, ok = true) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => response,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function env(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return overrides;
}

describe("configFromEnv", () => {
  it("requires a URL and token", () => {
    expect(() => configFromEnv(env({}))).toThrow("PAPER_READER_URL");
    expect(() =>
      configFromEnv(env({ PAPER_READER_URL: "https://paper-reader.example" })),
    ).toThrow("PAPER_READER_TOKEN");
  });

  it("accepts https and localhost but not plain http elsewhere", () => {
    expect(
      configFromEnv(
        env({
          PAPER_READER_URL: "http://localhost:3000",
          PAPER_READER_TOKEN: "secret",
        }),
      ),
    ).toEqual({ baseUrl: "http://localhost:3000", token: "secret" });
    expect(
      configFromEnv(
        env({
          PAPER_READER_URL: "https://paper-reader.example/",
          PAPER_READER_TOKEN: "secret",
        }),
      ).baseUrl,
    ).toBe("https://paper-reader.example");
    expect(() =>
      configFromEnv(
        env({
          PAPER_READER_URL: "http://paper-reader.example",
          PAPER_READER_TOKEN: "secret",
        }),
      ),
    ).toThrow("https");
  });
});

describe("paper format", () => {
  it("describes the publish schema and example", () => {
    const text = formatPaperFormat();
    expect(text).toContain("arxivId");
    expect(text).toContain('"pattern": "^\\\\d{4}\\\\.\\\\d{4,5}$"');
    expect(text).toContain("@@K0@@");
    expect(text).toContain("imageUrl is not accepted in v1");
    expect(SCHEMA).toEqual(
      expect.objectContaining({
        type: "object",
      }),
    );
    expect(EXAMPLE).toEqual(
      expect.objectContaining({ arxivId: "2401.01234" }),
    );
  });
});

describe("publishPaper", () => {
  const config = { baseUrl: "http://localhost:3000", token: "secret" };
  const payload = { arxivId: "2401.01234" };

  it("posts JSON with a bearer token and returns the URL", async () => {
    const fetchFn = fakeFetch({
      slug: "AAAAAAAAAAAAAAAAAAAAAAAA",
      url: "http://localhost:3000/read/arxiv/2401.01234?h=AAAAAAAAAAAAAAAAAAAAAAAA",
      expiresAt: "2026-01-01T00:00:00.000Z",
      deduped: false,
    });

    const result = await publishPaper(config, payload);
    expect(result.url).toContain("?h=");
    const call = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, RequestInit];
    expect(call[0]).toBe("http://localhost:3000/api/publish");
    expect(call[1].headers).toEqual(
      expect.objectContaining({ authorization: "Bearer secret" }),
    );
    expect(call[1].body).toBe(JSON.stringify(payload));
  });

  it("surfaces server error codes", async () => {
    fakeFetch(
      { error: { code: "HTML_AVAILABLE", message: "Use the HTML reader" } },
      409,
      false,
    );
    await expect(publishPaper(config, payload)).rejects.toThrow(
      "Use the HTML reader [HTML_AVAILABLE]",
    );
  });

  it("rejects malformed success bodies", async () => {
    fakeFetch({ url: 1, slug: "x", expiresAt: "", deduped: false });
    await expect(publishPaper(config, payload)).rejects.toThrow("malformed");
  });
});
