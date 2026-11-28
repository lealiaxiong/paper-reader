export const INSTRUCTIONS = `Return a JSON Schema describing the Paper Reader publish payload and a compact worked example.

The payload is an object with:
{
  "arxivId": "2401.01234",
  "title": "Paper title",
  "authors": ["First Author", "Second Author"],
  "paragraphs": [
    {"id": "p1", "text": "Plain paragraph text used for mapping.", "html": "Allowed <b>inline</b> HTML.", "mathTex": []}
  ],
  "figures": [
    {
      "id": "f1",
      "label": "Figure 1",
      "number": 1,
      "kind": "figure",
      "caption": "Figure 1: Verbatim caption.",
      "pdfPage": 2,
      "bbox": [0.1, 0.2, 0.5, 0.4]
    }
  ],
  "paraFigureMap": {"p1": ["f1"]},
  "client": {"name": "opencode", "model": "model-name", "skillVersion": "0.1.0"}
}

Rules:
- Paragraph ids are p1, p2, ... in reading order; figure ids are f1, f2, ...
- html may use only a, b, i, em, strong, cite, sub, sup, code, span, br. No scripts, styles, ids, event handlers, or external image URLs.
- Inline math uses @@K0@@, @@K1@@, ... in html; raw TeX strings are in mathTex in the same order.
- Captions are verbatim. Never invent numbers.
- Every figure has either tableHtml or a 1-based pdfPage, optionally a normalized bbox [x, y, width, height] in [0, 1].
- imageUrl is not accepted in v1.
- The server recomputes paraFigureMap; include it only to fill gaps.
- Save the emitted payload locally, such as paper-reader-<arxivId>.json. On expiry, re-send that saved payload instead of extracting the PDF again.
- A publish is accepted only for PDF-only arXiv papers. If arXiv HTML or ar5iv exists, use the normal reader instead.`;

export const EXAMPLE: Record<string, unknown> = {
  arxivId: "2401.01234",
  title: "Invented example with math and a vector figure",
  authors: ["Jane Example", "Alex Sample"],
  paragraphs: [
    {
      id: "p1",
      text: "The loss falls from 0.90 to 0.42 as shown in Figure 1.",
      html: "The loss falls from 0.90 to @@K0@@ as shown in <b>Figure 1</b>.",
      mathTex: ["0.42"],
    },
  ],
  figures: [
    {
      id: "f1",
      label: "Figure 1",
      number: 1,
      kind: "figure",
      caption: "Figure 1: Training loss by epoch.",
      pdfPage: 2,
      bbox: [0.12, 0.18, 0.76, 0.52],
    },
  ],
  paraFigureMap: { p1: ["f1"] },
  client: { name: "opencode", model: "model-name", skillVersion: "0.1.0" },
};

export const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["arxivId", "title", "authors", "paragraphs", "figures"],
  properties: {
    arxivId: { type: "string", pattern: "^\\d{4}\\.\\d{4,5}$" },
    title: { type: "string", minLength: 1, maxLength: 500 },
    authors: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
    paragraphs: {
      type: "array",
      minItems: 1,
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "html", "mathTex"],
        properties: {
          id: { type: "string", pattern: "^p[1-9][0-9]*$" },
          text: { type: "string", minLength: 1, maxLength: 20000 },
          html: { type: "string", maxLength: 100000 },
          mathTex: {
            type: "array",
            maxItems: 100,
            items: { type: "string", maxLength: 4000 },
          },
        },
      },
    },
    figures: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "number", "kind", "caption"],
        properties: {
          id: { type: "string", pattern: "^f[1-9][0-9]*$" },
          label: { type: "string", minLength: 1, maxLength: 100 },
          number: { type: ["integer", "null"], minimum: 0 },
          kind: { enum: ["figure", "table"] },
          caption: { type: "string", minLength: 1, maxLength: 5000 },
          tableHtml: { type: ["string", "null"], maxLength: 200000 },
          explanation: { type: "string", maxLength: 500 },
          pdfPage: { type: "integer", minimum: 1, maximum: 200 },
          bbox: {
            type: "array",
            items: { type: "number", minimum: 0, maximum: 1 },
            minItems: 4,
            maxItems: 4,
          },
        },
        allOf: [
          {
            if: { required: ["bbox"] },
            then: { required: ["pdfPage"] },
          },
        ],
      },
    },
    paraFigureMap: {
      type: "object",
      additionalProperties: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 40 },
      },
    },
    client: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 80 },
        model: { type: "string", maxLength: 120 },
        skillVersion: { type: "string", maxLength: 40 },
      },
    },
  },
};

export interface PublishResult {
  slug: string;
  url: string;
  expiresAt: string;
  deduped: boolean;
}

export interface PublishError {
  code: string;
  message: string;
  details?: unknown;
}

function errorMessage(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: { message?: unknown } }).error === "object" &&
    (body as { error: { message?: unknown } }).error !== null &&
    typeof (body as { error: { message?: unknown } }).error.message ===
      "string"
  ) {
    return (body as { error: { message: string } }).error.message;
  }
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return `Paper Reader publish failed (${status})`;
}

export interface ClientConfig {
  baseUrl: string;
  token: string;
}

export function configFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ClientConfig {
  const rawUrl = env.PAPER_READER_URL?.trim() ?? "";
  const token = env.PAPER_READER_TOKEN?.trim() ?? "";
  if (!rawUrl) throw new Error("PAPER_READER_URL is required");
  if (!token) throw new Error("PAPER_READER_TOKEN is required");

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new Error("PAPER_READER_URL must be an absolute URL");
  }

  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") {
    throw new Error("PAPER_READER_URL must use https, except for localhost");
  }

  return { baseUrl: baseUrl.toString().replace(/\/$/, ""), token };
}

export async function publishPaper(
  config: ClientConfig,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const res = await fetchImpl(`${config.baseUrl}/api/publish`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body !== "object") {
    const error = body as { error?: PublishError };
    throw new Error(
      `${errorMessage(body, res.status)}${
        error?.error?.code ? ` [${error.error.code}]` : ""
      }`,
    );
  }

  const result = body as PublishResult;
  if (typeof result.url !== "string" || typeof result.slug !== "string") {
    throw new Error("Paper Reader publish response was malformed");
  }
  return result;
}

export function formatPaperFormat(): string {
  return [
    INSTRUCTIONS,
    "",
    "JSON Schema:",
    JSON.stringify(SCHEMA, null, 2),
    "",
    "Worked example:",
    JSON.stringify(EXAMPLE, null, 2),
  ].join("\n");
}
