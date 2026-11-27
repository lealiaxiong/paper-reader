import * as cheerio from "cheerio";

export interface ArxivMetadata {
  title: string;
  authors: string[];
}

export class ArxivMetadataUnavailableError extends Error {}

/**
 * Look up the canonical title/authors for an arXiv ID. Returns null when the
 * API has no entry; throws when the API itself is unreachable (callers must
 * fail closed and let the client retry).
 */
export async function fetchArxivMetadata(
  arxivId: string,
): Promise<ArxivMetadata | null> {
  let res: Response;
  try {
    res = await fetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
      {
        headers: { "User-Agent": "paper-reader/0.1 (arXiv metadata check)" },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    throw new ArxivMetadataUnavailableError("arXiv metadata API unreachable", {
      cause: err,
    });
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ArxivMetadataUnavailableError(
      `arXiv metadata API returned ${res.status}`,
    );
  }

  let xml: string;
  try {
    xml = await res.text();
  } catch (err) {
    throw new ArxivMetadataUnavailableError(
      "arXiv metadata response could not be read",
      { cause: err },
    );
  }

  const $ = cheerio.load(xml, { xmlMode: true });
  const entry = $("entry").first();
  if (!entry.length) return null;

  const title = entry.find("title").first().text().replace(/\s+/g, " ").trim();
  const authors = entry
    .find("author > name")
    .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  if (!title) return null;
  return { title, authors };
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(" ").filter(Boolean));
}

/** 1 for an exact normalized match, otherwise Jaccard token overlap. */
export function titleSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const tokensA = titleTokens(a);
  const tokensB = titleTokens(b);
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Handle "Last, First" and "First Last"; fall back to the whole string. */
function surname(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const base = trimmed.includes(",")
    ? trimmed.slice(0, trimmed.indexOf(","))
    : trimmed;
  const tokens = base
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  return (tokens[tokens.length - 1] ?? "").toLowerCase();
}

export type MetadataMatch =
  | { ok: true }
  | { ok: false; reason: "title" | "authors" };

/**
 * Conservative cross-check: title similarity plus at least one shared author
 * surname. Titles from PDFs often drop math and punctuation, so exact equality
 * would reject valid submissions.
 */
export function metadataMatches(
  input: { title: string; authors: string[] },
  metadata: ArxivMetadata,
): MetadataMatch {
  if (titleSimilarity(input.title, metadata.title) < 0.8) {
    return { ok: false, reason: "title" };
  }

  const expected = new Set(metadata.authors.map(surname).filter(Boolean));
  if (expected.size > 0) {
    const provided = input.authors.map(surname).filter(Boolean);
    if (!provided.some((name) => expected.has(name))) {
      return { ok: false, reason: "authors" };
    }
  }

  return { ok: true };
}
