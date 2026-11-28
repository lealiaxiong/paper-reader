import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import {
  PARAGRAPH_SANITIZE,
  TABLE_SANITIZE,
  buildRegexFigureMap,
  toClientPayload,
} from "./paper";
import type { Figure, Paragraph, ReaderPayload } from "./types";

export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_PARAGRAPHS = 500;
export const MAX_FIGURES = 100;
export const MAX_PDF_PAGE = 200;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type PublishErrorCode =
  | "INVALID_ARXIV_ID"
  | "INVALID_SCHEMA"
  | "INVALID_FIGURE_SOURCE";

export class PublishPayloadError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const ParagraphSchema = z
  .object({
    id: z.string().regex(/^p[1-9]\d*$/),
    text: z.string().min(1).max(20_000),
    html: z.string().max(100_000),
    mathTex: z.array(z.string().max(4_000)).max(100),
  })
  .strict();

const BboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([x, y, w, h]) => [x, y, w, h].every((v) => v >= 0 && v <= 1), {
    message: "bbox values must be in [0,1]",
  })
  .refine(([x, y, w, h]) => x + w <= 1.0001 && y + h <= 1.0001, {
    message: "bbox must fit inside the page",
  });

const FigureSchema = z
  .object({
    id: z.string().regex(/^f[1-9]\d*$/),
    label: z.string().min(1).max(100),
    number: z.number().int().nonnegative().nullable(),
    kind: z.enum(["figure", "table"]),
    caption: z.string().min(1).max(5_000),
    imageUrl: z.unknown().optional(),
    tableHtml: z.string().max(200_000).nullable().optional(),
    explanation: z.string().max(500).optional(),
    pdfPage: z.number().int().min(1).max(MAX_PDF_PAGE).optional(),
    bbox: BboxSchema.optional(),
  })
  .strict();

const ClientSchema = z
  .object({
    name: z.string().max(80).optional(),
    model: z.string().max(120).optional(),
    skillVersion: z.string().max(40).optional(),
  })
  .strict();

const PublishSchema = z
  .object({
    arxivId: z.string().regex(/^\d{4}\.\d{4,5}$/),
    title: z.string().min(1).max(500),
    authors: z.array(z.string().min(1).max(200)).min(1).max(100),
    paragraphs: z.array(ParagraphSchema).min(1).max(MAX_PARAGRAPHS),
    figures: z.array(FigureSchema).max(MAX_FIGURES),
    paraFigureMap: z
      .record(z.string(), z.array(z.string().max(40)).max(20))
      .optional(),
    client: ClientSchema.optional(),
  })
  .strict();

type PublishInput = z.infer<typeof PublishSchema>;

export interface BuiltHandoff {
  arxivId: string;
  title: string;
  authors: string[];
  payload: ReaderPayload;
  client?: PublishInput["client"];
}

function plainText(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeParagraph(input: PublishInput["paragraphs"][number]): Paragraph {
  const text = plainText(input.text);
  const html =
    sanitizeHtml(input.html, PARAGRAPH_SANITIZE).replace(/\s+/g, " ").trim() ||
    sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });

  return {
    id: input.id,
    text,
    html,
    mathTex: input.mathTex.map((tex) => tex.replace(CONTROL_CHARS, "").trim()),
  };
}

function sanitizeFigure(input: PublishInput["figures"][number]): Figure {
  if (input.imageUrl !== undefined && input.imageUrl !== null) {
    throw new PublishPayloadError(
      "INVALID_FIGURE_SOURCE",
      422,
      `Figure ${input.id} must not use imageUrl in v1; use tableHtml or pdfPage/bbox.`,
    );
  }

  if (input.bbox && input.pdfPage === undefined) {
    throw new PublishPayloadError(
      "INVALID_FIGURE_SOURCE",
      422,
      `Figure ${input.id} has a bbox but no pdfPage.`,
    );
  }

  const tableHtml = input.tableHtml
    ? sanitizeHtml(input.tableHtml, TABLE_SANITIZE).trim()
    : null;

  if (!tableHtml && input.pdfPage === undefined) {
    throw new PublishPayloadError(
      "INVALID_FIGURE_SOURCE",
      422,
      `Figure ${input.id} needs tableHtml or pdfPage.`,
    );
  }

  const label = plainText(input.label);
  const caption = plainText(input.caption);
  if (!label || !caption) {
    throw new PublishPayloadError(
      "INVALID_SCHEMA",
      400,
      `Figure ${input.id} label/caption must contain visible text.`,
    );
  }

  const figure: Figure = {
    id: input.id,
    label,
    number: input.number,
    kind: input.kind,
    caption,
    imageUrl: null,
    tableHtml,
  };

  if (input.explanation) {
    figure.explanation = plainText(input.explanation);
  }
  if (input.pdfPage !== undefined) figure.pdfPage = input.pdfPage;
  if (input.bbox) figure.bbox = input.bbox;

  return figure;
}

function filterParaFigureMap(
  value: PublishInput["paraFigureMap"],
  paragraphs: Paragraph[],
  figures: Figure[],
): Record<string, string[]> {
  if (!value) return {};
  const paraIds = new Set(paragraphs.map((p) => p.id));
  const figureIds = new Set(figures.map((f) => f.id));
  const filtered: Record<string, string[]> = {};

  for (const [paraId, ids] of Object.entries(value)) {
    if (!paraIds.has(paraId)) continue;
    const valid = [...new Set(ids.filter((id) => figureIds.has(id)))];
    if (valid.length > 0) filtered[paraId] = valid;
  }
  return filtered;
}

function assertUnique(ids: string[], what: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new PublishPayloadError(
      "INVALID_SCHEMA",
      400,
      `Duplicate ${what} ids are not allowed.`,
    );
  }
}

/**
 * Validate, sanitize, and normalize an untrusted publish body. The model's
 * paragraph text is kept for regex mapping and then stripped from the payload.
 */
export function buildHandoffPayload(body: unknown): BuiltHandoff {
  const arxivId =
    body && typeof body === "object"
      ? (body as { arxivId?: unknown }).arxivId
      : undefined;
  if (typeof arxivId !== "string" || !/^\d{4}\.\d{4,5}$/.test(arxivId)) {
    throw new PublishPayloadError(
      "INVALID_ARXIV_ID",
      422,
      "arxivId must look like 2401.01234.",
    );
  }

  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    throw new PublishPayloadError(
      "INVALID_SCHEMA",
      400,
      "The payload does not match the expected schema.",
      parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  assertUnique(input.paragraphs.map((p) => p.id), "paragraph");
  assertUnique(input.figures.map((f) => f.id), "figure");

  const paragraphs = input.paragraphs.map(sanitizeParagraph);
  const figures = input.figures.map(sanitizeFigure);

  const clientMap = filterParaFigureMap(
    input.paraFigureMap,
    paragraphs,
    figures,
  );
  const regexMap = buildRegexFigureMap(paragraphs, figures);

  const title = plainText(input.title);
  if (!title) {
    throw new PublishPayloadError(
      "INVALID_SCHEMA",
      400,
      "The title must contain visible text.",
    );
  }

  const readerData = {
    source: "arxiv" as const,
    sourceId: input.arxivId,
    title,
    authors: input.authors.map(plainText).filter(Boolean),
    paragraphs,
    figures,
    paraFigureMap: { ...clientMap, ...regexMap },
    provenance: "byom" as const,
    format: "pdf" as const,
  };

  if (readerData.authors.length === 0) {
    throw new PublishPayloadError(
      "INVALID_SCHEMA",
      400,
      "At least one author is required.",
    );
  }

  return {
    arxivId: input.arxivId,
    title: readerData.title,
    authors: readerData.authors,
    payload: toClientPayload(readerData),
    ...(input.client ? { client: input.client } : {}),
  };
}
