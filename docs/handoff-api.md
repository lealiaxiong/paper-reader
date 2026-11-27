# Ephemeral handoff API

Status: design, not implemented. Companion to `docs/bring-your-own-model.md`. v1 is arXiv-only and pre-accounts: BYOM results are delivered through short-lived, unlisted capability links; the shared `paper:*` cache is never written, no PDFs are stored, and no figure assets are stored.

## Goals

- Accept a model-produced payload from a user's agent, validate and sanitize it, and expose it at a reader URL.
- Keep BYOM strictly out of the deterministic cache and out of the paper-ID namespace.
- Expire everything automatically, with no accounts and no background jobs required for correctness.
- Render figures from the public arXiv PDF via `pdfPage`/`bbox`, so there is nothing to upload or clean up.
- Never store PDFs; stream them on demand.

## Non-goals

- Durable or shareable public BYOM pages (that is post-accounts).
- Non-arXiv sources, private uploads, or server-side PDF parsing.
- Storing figure crops or any binary assets in v1.
- Pretty URLs or discoverability by arXiv ID.

## URL surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/publish` | Validate a payload, create a handoff, return its URL. |
| `GET` | `/api/handoff/<slug>` | Return the sanitized `ReaderPayload` + metadata. |
| `POST` | `/api/explanations` | Attach glosses to a handoff, or create an overlay. |
| `DELETE` | `/api/handoff/<slug>` | Takedown (publisher or admin token only). |
| `GET` | `/read/arxiv/<id>?h=<slug>` | Render page from the handoff. |
| `GET` | `/read/arxiv/<id>?e=<slug>` | Render deterministic page + gloss overlay. |
| `GET` | `/api/pdf/arxiv/<id>` | Stream the public arXiv PDF (no persistence). |

## Authentication and ownership

`PUBLISH_TOKENS` is a comma-separated set of deploy-issued bearer tokens. Each token is a publisher identity:

```
publisherId = sha256(token)
```

- Required on `POST /api/publish`, `POST /api/explanations`, and `DELETE /api/handoff/<slug>`. The delete also accepts an admin token.
- Compared in constant time; rate-limited per token + IP.
- A handoff records its `publisherId`. Mutations must come from the same publisher (or admin), so a shared token set still gives per-publisher isolation.
- `GET /api/handoff/<slug>`, page renders, and PDF streaming are **capability-only**: the unguessable slug is the secret.
- Clients send one of these tokens as `PAPER_READER_TOKEN`; the server compares it against `PUBLISH_TOKENS`.
- Future: mint per-user tokens after an identity check, then bind handoffs to accounts.

## Lifecycle defaults

| Setting | Default | Notes |
| --- | --- | --- |
| `HANDOFF_TTL_SECONDS` | `21600` (6h) | Cap 24h. Expiry is the UX promise. |
| `MAX_PAYLOAD_BYTES` | `2097152` (2 MB) | JSON body. |
| `MAX_PARAGRAPHS` | `500` | |
| `MAX_FIGURES` | `100` | |
| `MAX_PDF_PAGE` | `200` | Sanity bound on `pdfPage`. |

Slug: 24+ chars of base64url from a CSPRNG (`crypto.randomBytes(18).toString("base64url")`). Never sequential or derived from the arXiv ID.

## Storage

No new database and no blob store. Redis only, both keys disposable.

| Key | Value | TTL |
| --- | --- | --- |
| `handoff:v1:<slug>` | `HandoffRecord` (below) | `HANDOFF_TTL_SECONDS` |
| `gloss:v1:<slug>` | `{ arxivId, explanations, publisherId, createdAt, expiresAt }` | same as handoff |

- Payloads are size-capped at 2 MB (typically ~600 KB), well under Upstash's 10 MB request limit. If a payload would exceed the cap, reject it (`PAYLOAD_TOO_LARGE`) rather than spilling to blob storage.
- Local dev uses the existing in-memory fallback (`src/lib/cache.ts` pattern).
- No binaries are ever written to Redis or blob storage.

```ts
interface HandoffRecord {
  version: 1;
  slug: string;
  arxivId: string;
  publisherId: string;        // sha256(token); never the raw token
  /** ReaderPayload: paragraph text already stripped. */
  payload: ReaderPayload;
  provenance: "byom";
  createdAt: number;
  expiresAt: number;
  contentHash: string;
  client?: { name?: string; model?: string; skillVersion?: string };
}
```

## `POST /api/publish`

Request (`application/json`):

```ts
interface PublishRequest {
  arxivId: string;                     // ^\d{4}\.\d{4,5}$
  title: string;
  authors: string[];
  paragraphs: {
    id: string;                        // p1, p2, ...
    text: string;                      // required: regex map + page alignment
    html: string;                      // sanitized allowlist only
    mathTex: string[];                 // ordered @@K{n}@@ TeX
  }[];
  figures: Figure[];                   // ids f1..., verbatim captions
  paraFigureMap?: Record<string, string[]>;
  client?: { name?: string; model?: string; skillVersion?: string };
}
```

Steps:

1. Authenticate, derive `publisherId`, and rate-limit.
2. Validate shape, counts, and byte caps; reject unknown keys.
3. Validate `arxivId` and refuse if deterministic HTML/ar5iv exists:
   - `409 HTML_AVAILABLE` with `{ url: "/read/arxiv/<id>", source }`.
4. Verify title/authors against the arXiv metadata API (`export.arxiv.org/api/query?id_list=...`). Normalize case/whitespace/punctuation; reject strong mismatches with `422 ARXIV_METADATA_MISMATCH` and return the expected values. If the API is unreachable, `503 METADATA_UNAVAILABLE` (fail closed; the client can retry).
5. Re-sanitize every `paragraphs[].html` (`PARAGRAPH_SANITIZE`) and `tableHtml` (`TABLE_SANITIZE`).
6. Recompute `paraFigureMap` with `buildRegexFigureMap`; use the client map only for paragraphs the regex map misses.
7. Validate figure sources:
   - `imageUrl` must be `null`/omitted in v1 (`422 INVALID_FIGURE_SOURCE`). Figures must use `tableHtml` or `pdfPage` (+ optional `bbox`).
   - `pdfPage` is a positive integer `<= MAX_PDF_PAGE`.
   - `bbox` is four normalized numbers in `[0,1]` with `x + w <= 1` and `y + h <= 1`.
8. Compute `contentHash` over the canonical JSON (stable key order). If an unexpired handoff with the same `arxivId`, `contentHash`, and `publisherId` exists, return it with `deduped: true` (do not extend its TTL). Different publishers get different slugs.
9. Write `handoff:v1:<slug>` and return.

Response `201` (or `200` when deduped):

```ts
interface PublishResponse {
  slug: string;
  url: string;          // /read/arxiv/<id>?h=<slug>
  expiresAt: string;    // ISO 8601
  deduped: boolean;
}
```

## Figure rendering (no asset store)

Figures are rendered from the source PDF, not uploaded:

- The page loads `/api/pdf/arxiv/<id>` and uses PDF.js to render the target page to a canvas.
- For a `pdfPage` + `bbox`, the canvas is cropped to the normalized box.
- If `bbox` is absent or invalid, show the full page above the caption.
- `tableHtml` still renders inline as today.
- Precedence: `tableHtml` -> `pdfPage` crop -> caption only.

The same PDF.js page cache serves the PDF pane and figure crops, so there is a single renderer to build and test. No `upload_figure_image` tool exists in v1.

## `GET /api/handoff/<slug>`

- Look up `handoff:v1:<slug>`. `410 HANDOFF_EXPIRED` when gone (not 404, so the UI can say "re-run your agent").
- Return:

```ts
interface HandoffResponse {
  data: ReaderPayload;  // unchanged reader shape
  provenance: "byom";
  arxivId: string;
  expiresAt: string;
}
```

- Headers: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`.

There is **no active deterministic re-check** in v1. Publish already refuses when HTML/ar5iv exists; if HTML appears later, it is picked up on the next session after the handoff TTL (at most 6h of staleness). Revisit stale-while-revalidate only if this proves too slow.

## Consuming `?h=` on the page

`GET /read/arxiv/<id>?h=<slug>`:

1. Read `h` from `searchParams`; load the handoff.
2. If missing/expired -> the honest "PDF-only; re-run your agent" state with an **Open original PDF** action.
3. If `arxivId` in the URL does not match the record -> `404` (do not reveal whether the slug exists for another paper).
4. Otherwise render the existing reader with `provenance: byom` and a badge, plus expiry and **Open original PDF**.

Do **not** strip `h` from the URL in v1: keeping it makes reload and in-TTL sharing work without extra client state. Redact it instead:

- `Referrer-Policy: no-referrer` on the page.
- `X-Robots-Tag: noindex, nofollow`.
- Strip `h`/`e` from access logs, analytics, and any outbound links.
- Never put `h` in canonical/OG metadata.

The same page accepts `?e=<glossSlug>` to merge an explanation overlay onto the deterministic payload. `h` and `e` may coexist.

## `POST /api/explanations`

Two modes:

```ts
interface ExplanationsRequest {
  slug?: string;                      // attach to an existing handoff
  arxivId?: string;                   // required when creating an overlay
  explanations: Record<string, string>; // figureId -> text
}
```

- **Handoff mode (`slug`):** verify the slug exists and the caller's `publisherId` matches; update `figures[].explanation` in place; TTL unchanged.
- **Overlay mode (`arxivId`):** create `gloss:v1:<glossSlug>` with a short TTL and return `{ url: "/read/arxiv/<id>?e=<glossSlug>", expiresAt }`. The page merges it at render time; `paper:*` is untouched. This is the default for deterministic HTML papers.
- The app may also mirror glosses into `localStorage` keyed by arXiv ID on first view, so they survive overlay expiry. The overlay remains the reliable, cross-device path.
- Glosses are plain text: strip control characters and HTML, cap at 500 chars each, and ignore ids that do not exist in the payload.
- Never allow an explanation write to change paragraphs, figures' captions, or `paraFigureMap`.
- For BYOM PDF papers, prefer putting glosses directly in `figures[].explanation` at publish time; no overlay is needed.

## PDF streaming

`GET /api/pdf/arxiv/<id>`:

- Validate the id; proxy `https://arxiv.org/pdf/<id>` with the same `User-Agent` as `fetchPaperHtml`, a 20 MB cap, 30s timeout, and `Content-Type: application/pdf` verification.
- Forward `Range` and return `206`/`Accept-Ranges` when arXiv supports it; otherwise stream the full body.
- `Cache-Control: public, max-age=3600`; never write the bytes to our storage.
- Used by the PDF pane and figure crops; the reader never depends on it to render text.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` / `INVALID_SCHEMA` | Malformed body or unknown keys. |
| 401 | `UNAUTHORIZED` | Missing/incorrect bearer token. |
| 403 | `FORBIDDEN` | Wrong publisher for a mutation. |
| 404 | `HANDOFF_NOT_FOUND` | Unknown slug, or wrong paper for the slug. |
| 409 | `HTML_AVAILABLE` | Deterministic HTML/ar5iv exists; use it. |
| 410 | `HANDOFF_EXPIRED` | TTL elapsed; re-run the agent. |
| 413 | `PAYLOAD_TOO_LARGE` | Over the payload cap. |
| 422 | `INVALID_ARXIV_ID` / `ARXIV_METADATA_MISMATCH` / `INVALID_FIGURE_SOURCE` | Fixable payload problem. |
| 429 | `RATE_LIMITED` | Back off and retry. |
| 502 | `UPSTREAM_ERROR` | arXiv failure. |
| 503 | `METADATA_UNAVAILABLE` | arXiv API unreachable; retry. |

Errors return `{ error: { code, message, details? } }`.

## Security

- **Capability URLs are the secret.** Short TTL, no index, no referrer, log redaction, no discovery by paper ID.
- **Model output is hostile.** Schema validation, allowlist sanitization, recomputed map, size caps, and rejection of external image URLs are mandatory.
- **No binaries, no storage sprawl.** Figures render from the public PDF; the only BYOM persistence is the capped JSON payload and optional gloss overlay.
- **No payload logging.** Treat payloads as user content; do not train on them.
- **Abuse controls.** Per-token and per-IP rate limits; TTL caps storage; publisher-scoped hash dedupe.
- **Takedown.** `DELETE /api/handoff/<slug>` from the owning publisher or an admin removes the record (and a matching `gloss:` overlay); the same check uses the stored `publisherId`. Bumping the schema version (`v2`) is the blunt instrument.
- **No consumer-account automation.** Clients call us; we never call a user's account.

## MCP tool mapping

| Tool | Endpoint |
| --- | --- |
| `paper_format()` | Local static schema (no server call). |
| `publish_paper(payload)` | `POST /api/publish` |
| `publish_explanations(paperUrl, glosses)` | `POST /api/explanations` |
| `fetch_arxiv_pdf(id)` | `GET /api/pdf/arxiv/<id>` |

`paperUrl` carries `h` or `e`; the MCP server parses it into `slug`/`arxivId` for the explanations call.

## Resolved decisions

1. **Binding:** capability link for reading; publisher token for mutations. No IP binding. A per-handoff secret is unnecessary while tokens are per-publisher.
2. **Assets:** no asset store in v1. Figures use `pdfPage`/`bbox` rendered from the streamed PDF. Revisit blob storage only when non-arXiv or private uploads arrive.
3. **Gloss default:** `?e=` overlay, with an optional `localStorage` mirror; glosses inline in the handoff for BYOM papers.
4. **Dedupe:** publisher-scoped hash dedupe. Different publishers never share a slug or lifetime.
5. **Recheck:** none in v1. Short TTL plus the skill's publish-time HTML check bounds staleness.

## Future / deferred

- Per-user tokens and account-scoped handoffs.
- Non-arXiv and private-upload figures that need real asset storage.
- Stale-while-revalidate HTML promotion if the 6h window proves too slow.
- Server-side or pre-rendered figure crops for providers that cannot render PDF.js.
