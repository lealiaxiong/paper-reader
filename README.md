# Paper Reader

An arXiv reader tuned for human reading: a 650px text column with the paper's figures floating in a side margin next to the paragraphs that cite them — no more hunting through pages to find the chart a paragraph is talking about.

Paste (or drag-and-drop) any arXiv link. The paper renders at reading width; as you scroll, the figure cited by the visible paragraph surfaces in the sidebar. When figure explanations are enabled, each figure also gets a plain-English **"In short:"** gloss.

## Features

- **650px reading column**, light-mode only. Figure sidebars and lightbox stay legible against light-background figures.
- **Scroll-synced margin figures.** Whichever paragraph is centered becomes active; its cited figure(s) highlight and align to the paragraph's height. Multiple-figure paragraphs get a carousel (`‹ 1/2 ›` + dots) that resets to the first figure when the paragraph changes and preserves your choice while scrolling within it.
- **AI figure explanations (optional).** When configured, each figure gets a 1–2 sentence plain-English gloss shown as a blue callout, distinct from the violet active-paragraph highlight. Requires `OPENROUTER_API_KEY`; set `ENABLE_EXPLANATIONS=false` to run fully deterministic.
- **Full-screen lightbox.** Click any figure or table to open it at natural size. Rendered via a portal above the URL bar (`z-100`) so it covers the whole page.
- **Math via KaTeX.** arXiv's `<math>` TeX is extracted server-side and rendered client-side.
- **Clean citations, no bibliography jumps.** `#bib.*` links are resolved to the real source: arXiv ID → `arxiv.org/abs/…`, DOI → `doi.org/…`, otherwise a short-query Google Scholar search. The full bibliography entry shows as a tooltip; double-comma artifacts (`"Bender et al.,, 2021"`) are normalized.
- **Footnote cleanup.** arXiv HTML embeds full footnote text inside body paragraphs; the extractor strips it down to a superscript marker so the note doesn't duplicate in the text.
- **Panel merging.** Tables/figures split across multiple `<figure>` elements (container + panel) are merged into one card. Figure N and Table N are never conflated — papers number them independently.
- **Caching.** Shared through Upstash Redis when configured (24h TTL, keys namespaced `paper:v1:<id>`), with an in-memory fallback for local dev. Keyed by arXiv ID, so `abs/`, `html/`, and `pdf/` links for the same paper share one entry.
- **Anonymous, single-use.** No accounts or history — paste a link, read, close.
- **Drag-and-drop.** Drop an arXiv link anywhere on the page to load it.

## How it works

### Pipeline

1. **Fetch.** The API route (`src/app/api/fetch/route.ts`) server-side fetches `https://arxiv.org/html/{id}`. Papers without an HTML version return a clear error — arXiv generates HTML asynchronously for recent submissions, and some older papers never got one.
2. **Extract.** Cheerio parses title, authors, paragraphs, and figures (caption + image URL, or table HTML when the source has no image). Figure panels are merged by ID prefix; table HTML is compacted (LaTeXML `class`/`id` attributes dropped, `colspan`/inline styles kept). Bibliography entries are scanned for arXiv IDs/DOIs to resolve citations. Math is replaced with `@@K{n}@@` placeholders and the raw TeX is collected for client-side KaTeX rendering.
3. **Map paragraphs → figures (regex).** A deterministic pattern matches `Figure N` / `Fig. N` / `Table N` (including ranges like `Figures 46–50`) and links them **kind-aware** — `Figure 6` and `Table 6` are distinct. This is the only mapping path: free, instant, and accurate for explicit citations.
4. **Explain figures (optional).** When `OPENROUTER_API_KEY` is set (and `ENABLE_EXPLANATIONS` is not `"false"`), Meta Muse Ember via OpenRouter writes the "In short:" glosses — batched 8 figures per call, in parallel, from each caption plus up to three citing paragraphs. Failure-safe: if a batch fails, captions still render.
5. **Trim + cache.** Paragraph plain text (server-only) is stripped from the response payload, then the paper is cached by arXiv ID — Upstash Redis when configured (24h TTL), otherwise in memory.

### Model usage

Meta Muse Ember (`meta/muse-ember`, 1M-token context) is reached through OpenRouter. It is a **reasoning model**: it spends most of its token budget on hidden reasoning before emitting content.

- The model is used for figure explanations only; extraction and paragraph→figure mapping are deterministic. (An LLM mapping alternative was measured against regex on a test paper and performed worse — 37 vs 43 mapped paragraphs — so it was removed.)
- An earlier full-paper reformatting prompt truncated mid-JSON ("Unterminated string") and was replaced by the deterministic extractor.
- Explanations use small batches (8 figures/call, `max_tokens: 8000`) so reasoning comfortably fits in budget. Tune these in `src/lib/paper.ts`.

## Quick start

```bash
npm install

# Optional: enable AI figure explanations
cp .env.example .env
# then set OPENROUTER_API_KEY=sk-or-...

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste an arXiv link, e.g. `https://arxiv.org/abs/2203.02155`.

### Environment variables

All optional — without any of them the app runs fully deterministically with an in-memory cache.

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Enables the "In short:" figure explanations |
| `ENABLE_EXPLANATIONS` | Set to `false` to disable explanations even when a key is present |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis shared cache (also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) |

## Deployment

Deployed on Vercel (Hobby plan). `src/app/api/fetch/route.ts` exports `maxDuration = 60` (mirrored in `vercel.json`) so explanation batches fit on large papers.

1. Import the repository into Vercel.
2. Optional: **Storage → Marketplace → Upstash Redis** (free tier) to enable the shared cache; the integration injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. Optional: set `OPENROUTER_API_KEY` for explanations, or `ENABLE_EXPLANATIONS=false` to keep the deployment deterministic.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the scraper test suite (Vitest) |
| `npm run test:watch` | Run Vitest in watch mode |

## Testing

`npm test` runs Vitest against pinned arXiv HTML fixtures in `test/fixtures/` (gzipped, no network access). The suite covers arXiv ID parsing, extraction (paragraphs, authors, figures, tables, math, citation links, footnote stripping), table HTML compaction, regex figure mapping, and client payload trimming. To refresh a fixture, download the pinned arXiv HTML version and gzip it, then update any counts that changed intentionally.

## Tech stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Cheerio** — server-side HTML parsing
- **KaTeX** — math rendering
- **Upstash Redis** — shared deployment cache (optional)
- **OpenRouter** (`meta/muse-ember`) — figure explanations (optional)

## Known limitations

- **No rate limiting.** The fetch endpoint is an unauthenticated proxy to arXiv (and to OpenRouter when explanations are enabled). Add auth/rate limiting before promoting it widely.
- **Papers without an arXiv HTML version** return an error with an explanation. This happens with very new submissions (HTML is generated asynchronously) and some older papers; PDF fallback is not implemented.
- **Tables render inline as HTML**, not as images — that's by design (there's often no image file in the source), but very wide tables scroll inside their card.
