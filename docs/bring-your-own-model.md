# Bring Your Own Model (BYOM): PDF extraction using the user's own agent

Status: design, not implemented. Target clients, in order: **OpenCode (v1)**, **Claude (v2)**, **ChatGPT (v3)**. The contract is client-agnostic; only the delivery layer changes.

## Problem

Three pressures converge:

1. **PDF-only papers.** Many papers have no arXiv HTML and no ar5iv conversion. Today `fetchPaperHtml` (`src/lib/paper.ts`) throws when both providers lack LaTeXML markup, so these papers cannot be read at all. Users also want to read PDFs they already have access to.
2. **Figure explanations cost API tokens.** `buildFigureExplanations` calls OpenRouter (`meta/muse-ember`) and bills the deploy owner for every paper.
3. **Users already have a model.** Users already pay for inference through their own agent/subscription and work inside it daily.

## Key constraint

A user's Claude/ChatGPT/OpenCode entitlement is **not API access**. We cannot spend it from our server. Therefore the extraction must happen *inside the user's client*, using the user's quota. Our server only receives the structured result, validates it, hands it off briefly, and serves it to the existing reader.

That inverts the pipeline: instead of `server → arXiv → LLM → client`, we get `user's agent → tool call → server handoff → existing client`.

## Why OpenCode first

OpenCode is a better v1 than a chat app because it is an agentic CLI, not just a chat window:

- **Native PDF input.** OpenCode's `read` tool returns PDFs as file attachments, so a vision-capable provider can read pages directly.
- **Shell + filesystem.** It can run bundled scripts to rasterize pages for its own reading (`pdftoppm`, `pdfimages`, `mutool`, or `pdfjs-dist`); figure crops are rendered by the app, not uploaded. Web chat connectors cannot do this; only desktop/CLI agents that run a local process can.
- **Skills and local MCP are first-class.** A skill carries the instructions + scripts; a local stdio MCP server exposes typed tools. No public connector hosting required for v1.
- **Bring-your-own provider.** It runs on whatever the user configured (`opencode auth login`, Copilot, local models), so inference never bills the deploy owner.
- **Live contract.** The skill can point the model at `src/lib/types.ts` and `src/lib/paper.ts`, so the schema is self-documenting and stays in sync.
- **Trade-off:** smaller, developer-heavy audience than Claude/ChatGPT. That is acceptable for a v1 that proves the pipeline; Claude follows with the same contract.

## Architecture (OpenCode v1)

```
OpenCode (user's provider = user's quota)
   ├─ skill: paper-reader          (how to read + emit our format)
   ├─ read <pdf>                   (native PDF attachment, or script fallback)
   ├─ scripts/crop-figures.mjs     (page rasters to help the model read, optional)
   └─ MCP tools (local stdio)
        └─ publish_paper(payload)   -> https://<app>/read/arxiv/<id>?h=<slug>
            │
paper-reader MCP server
   ├─ validate against ReaderPayload schema
   ├─ re-sanitize all HTML server-side (never trust model output)
   ├─ store an ephemeral handoff (short TTL; never the paper cache)
   └─ return URL
            │
paper-reader app
   └─ renders the existing components unchanged
```

## Data contract

Reuse the existing types in `src/lib/types.ts`; the renderer already consumes `ReaderPayload`:

```ts
interface ReaderPayload {
  source: SourceId;              // stays "arxiv" in v1
  sourceId: string;              // arXiv id
  title: string;
  authors: string[];
  paragraphs: { id: string; html: string; mathTex: string[] }[];
  figures: Figure[];
  paraFigureMap: Record<string, string[]>; // paraId -> figureId[]
}
```

### Contract rules the model must follow

- `paragraphs[].html` uses only the tags allowed by `PARAGRAPH_SANITIZE` (`src/lib/paper.ts`): `a, b, i, em, strong, cite, sub, sup, code, span, br`. No styles, no ids, no scripts.
- Inline math is emitted as `@@K{n}@@` placeholders; the raw TeX goes in `mathTex[n]`, in order. The existing client renders KaTeX, so this path is unchanged.
- `paragraphs[].id` is `p1`, `p2`, …; `figures[].id` is `f1`, `f2`, ….
- Each paragraph also carries a plain `text` field (input-only; used for the regex map and page alignment). It is not part of `ReaderPayload` and is dropped after validation.
- Captions are copied **verbatim** from the paper. The model may add `explanation`, but must not invent numbers.
- `paraFigureMap` may be produced by the model, but the server always **recomputes** it with `buildRegexFigureMap` so it stays deterministic and quote-safe. The model's map is only a fallback for captions that regex misses (e.g. "the chart below").
- Text lengths are capped server-side per field (see [`docs/handoff-api.md`](./handoff-api.md)).

### Figure source

- **All clients (v1):** figures carry optional `pdfPage` + normalized `bbox`; the app renders the crop client-side with PDF.js from the streamed arXiv PDF. Nothing is uploaded or stored.
- OpenCode can still rasterize pages locally to help the model read them, but that output is not uploaded.

```ts
interface Figure {
  // ...existing fields...
  pdfPage?: number;                          // 1-based page in the source PDF (streamed)
  bbox?: [number, number, number, number];   // normalized x, y, w, h in [0,1]
}
```

Precedence when rendering a figure: `tableHtml` -> `pdfPage` crop -> caption only. `imageUrl` remains for the deterministic HTML path and is rejected for BYOM in v1.

## Deliverables (OpenCode v1)

### Skill

Location (project or global):

```
.opencode/skills/paper-reader/SKILL.md
.opencode/skills/paper-reader/scripts/crop-figures.mjs
```

Frontmatter:

```markdown
---
name: paper-reader
description: Use when the user wants to read a PDF-only, user-uploaded, or non-arXiv paper in Paper Reader, or regenerate a paper's figure explanations with their own model.
---
```

Skill flow:

1. Detect input: a local PDF path, an arXiv ID, or a URL.
2. If the paper has arXiv HTML, prefer the existing deterministic app (`/read/arxiv/<id>`) and only offer explanation backfill.
3. Otherwise `read` the PDF (native attachment). If the provider cannot take PDFs, run `crop-figures.mjs` to emit per-page PNGs for reading; figure images are not uploaded.
4. Emit the payload per the contract above, copying captions verbatim.
5. Call `publish_paper(...)`; for raster figures set `pdfPage`/`bbox` so the app can crop from the streamed PDF.
6. Return the URL to the user.

Ship 1–2 worked examples (a small invented paper, not copyrighted text) so the model sees the exact output.

### MCP server

Same code later exposed over two transports: **local stdio** (OpenCode, v1) and **remote HTTP** (Claude, v2).

| Tool | Purpose |
| --- | --- |
| `paper_format()` | Returns the JSON schema + a worked example so the model emits the right shape. |
| `publish_paper({ arxivId, title, authors, paragraphs, figures, paraFigureMap? })` | Validates, sanitizes, creates an ephemeral handoff, returns `{ url }`. Idempotent per publisher + content hash. |
| `publish_explanations(paperUrl, { f1: "…" })` | Writes an ephemeral gloss overlay (or updates a handoff). Replaces the OpenRouter call with the user's quota. |
| `fetch_arxiv_pdf(id)` *(optional)* | Returns the PDF as a resource so the user need not upload it. |

OpenCode config (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "paper-reader": {
      "type": "local",
      "command": ["npx", "-y", "paper-reader-mcp"],
      "environment": {
        "PAPER_READER_URL": "https://paper-reader.example",
        "PAPER_READER_TOKEN": "{env:PAPER_READER_TOKEN}"
      }
    }
  }
}
```

Restart OpenCode after adding the config; it is not hot-reloaded.

## Ingest endpoint (server)

See [`docs/handoff-api.md`](./handoff-api.md) for the concrete routes, payloads, TTLs, and errors. In short:

New route, e.g. `POST /api/publish`:

1. **Auth**: a deploy-issued bearer token identifying the publisher; rate-limit per token and IP.
2. **Validate** shape and sizes: max paragraphs, max figure count, max bytes per field/overall.
3. **Sanitize** every `paragraphs[].html` with `PARAGRAPH_SANITIZE` and every `tableHtml` with `TABLE_SANITIZE`. **Do not trust the model's HTML** — it is as untrusted as author-controlled LaTeX.
4. **Recompute** `paraFigureMap` with `buildRegexFigureMap`; merge model-supplied mappings only for paragraphs the regex map misses.
5. **Figures**: reject `imageUrl` in v1; accept `tableHtml` or `pdfPage`/`bbox` for client-side rendering from the streamed PDF.
6. **Hand off, do not cache.** Store an ephemeral entry under an unguessable slug with a short TTL (1–6h) in a dedicated `handoff:` namespace. Never write the shared `paper:*` cache, and refuse the publish if deterministic HTML/ar5iv exists.
7. **Return** `{ url }` pointing at the unlisted handoff (`/read/arxiv/<id>?h=<slug>` or `/r/<slug>`).

No new source in v1: the paper stays `arxiv`, and the handoff is a transient overlay keyed by its slug, not a source route. The reader consults it only when the capability slug is present; without the slug the canonical route stays deterministic.

## Claude (v2)

Same contract; the delivery surface decides how much image work is possible. Claude has three relevant surfaces:

| Surface | Host shell? | MCP transport | Figure strategy |
| --- | --- | --- | --- |
| Claude Desktop | Yes — local MCP runs as a local process | local stdio | `pdfPage`/`bbox` + PDF.js crop |
| Claude Code (CLI) | Yes — full local shell; skill scripts run via bash | local stdio | `pdfPage`/`bbox` + PDF.js crop |
| claude.ai (web) | No host access; sandboxed bash/code-exec only | remote HTTP connector | `pdfPage`/`bbox` + PDF.js crop, or a server-side renderer |

Notes:

- **Agent Skill** at `.claude/skills/paper-reader/SKILL.md` (or the claude.ai zip upload) plus a **remote MCP connector** for the web surface.
- The user attaches the PDF in chat; Claude reads it natively.
- Figures always render from the streamed arXiv PDF via `pdfPage`/`bbox`; Desktop/Code can rasterize pages to help the model read, but do not upload crops.
- Ship the remote HTTP transport of the same MCP server; tool signatures are identical.

## ChatGPT (v3)

Same contract; **a Custom GPT is not required**. Current options (as of 2026):

- **ChatGPT web:** Plugins → Add custom MCP server (remote HTTPS, no Developer Mode needed). Plan gating is the catch: full read *and write* is Business/Enterprise/Edu, Pro is read/fetch on web, Plus is unclear. Because `publish_paper` is a write tool, web personal plans are a poor fit.
- **ChatGPT desktop app:** runs local stdio MCP servers from the shared Codex `config.toml`/Settings → MCP servers, available on Plus and up. This is the preferred personal-plan route and reuses the OpenCode local transport.
- **Workspace route:** Business/Edu admins publish the remote connector org-wide.

Treat it as a port of the same contract, not a rewrite.

## Security and abuse

- **Sanitization is mandatory and server-side.** Model output never bypasses `sanitize-html`.
- **No external image URLs** in v1; BYOM figures render from the streamed arXiv PDF, and the PDF endpoint stays same-origin.
- **Rate limit** the publish and explanation routes (reuse `src/lib/ratelimit.ts`) and cap payload size.
- **Short TTL + unguessable capability slug** keeps the no-accounts model intact; nothing is discoverable by paper ID. Reads are capability-only; mutations require the publisher token.
- **User-initiated only.** The client calls our tool, never the reverse. Do not automate calls into consumer accounts.
- **Do not log** payloads or PDF URLs with capability params; treat them as user content.

## Quality position

- Keep the deterministic arXiv path as the primary source. BYOM is for PDF-only, non-arXiv, and user uploads.
- LLM extraction is best-effort; the validation + sanitization layer is what makes it safe to accept.
- The single highest-ROI slice is `publish_explanations`: it removes the OpenRouter bill with no PDF work and reuses the existing deterministic extraction.

## Phasing

1. **OpenCode explanation backfill** — skill + `publish_explanations` + publish route. Fastest win: eliminates the API token cost.
2. **OpenCode PDF ingestion** — `read`-based extraction + `crop-figures.mjs` + `pdfPage`/`bbox` figures + ephemeral handoff. Solves PDF-only papers.
3. **Local MCP packaging** — publish `paper-reader-mcp` to npm, document `opencode.json` + skill install.
4. **Claude v2** — remote HTTP transport, Agent Skill, `pdfPage`/`bbox` + PDF.js crop rendering.
5. **ChatGPT v3** — instruction layer port once connector support settles.

## Resolved decisions

- Handoff lifetime: short TTL (6h default, 24h cap).
- Handoff sharing: capability link for reading; mutations require the publisher token. No IP binding.
- Figures: no asset store in v1; render `pdfPage`/`bbox` crops from the streamed PDF.
- Glosses: `?e=` overlay by default, optional `localStorage` mirror; inline for BYOM papers.
- Dedupe: publisher-scoped content hash.
- Recheck: none in v1; short TTL plus the publish-time HTML check.

## Remaining open questions

- Bbox accuracy, especially on vector figures: confirm during the M0 spike and fall back to a full page.
- Attribution/licensing when a user publishes a PDF they uploaded; show a "user-provided" badge in the reader.
- Distribution beyond npm: Claude skill marketplace / OpenCode skill registry, and a one-command installer.
