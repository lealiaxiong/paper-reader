# Paper Reader

An arXiv reader tuned for human reading: a 650px text column with the paper's figures in a rail beside it, the pair centered together on wide screens. Figures stay next to the paragraphs that cite them — no more hunting through pages to find the chart a paragraph is talking about.

Paste (or drag-and-drop) any arXiv link. The paper renders at reading width; as you scroll, the figure cited by the visible paragraph surfaces in the figure rail at 1280px and above, or in a bottom drawer below that. Each paper has a canonical URL (`/read/arxiv/2401.12345`), so reloads, bookmarks, and shared links reopen the same paper. When figure explanations are enabled, each figure also gets a collapsed plain-English **In short** note. Muse Ember's authorship is stated once in the figure rail or drawer, not repeated on every card.

## Features

- **650px reading column in light or dark.** Lexend for paper content at 18px/1.7, with IBM Plex Sans for interface chrome. The warm paper palette is easy on the eyes; the theme follows the OS by default, with a header toggle that persists your choice. Figures and tables always sit on a light media mat, with a slight image dim in dark mode so plots stay legible without glare.
- **Addressable paper URLs.** Opening a paper changes the address to `/read/arxiv/<id>`; refreshing, sharing, and browser back/forward all work. The source is part of the route, so future providers can live under `/read/doi/...` or `/read/openreview/...` without changing the reader.
- **A reading toolbar.** Once a paper is open, the header keeps its title and arXiv ID visible. **Open another** opens a URL popover without reflowing the page, and drag-and-drop still works anywhere. Both navigate to the new paper’s canonical URL.
- **Quiet reading highlights.** Paragraphs that cite a figure get an accent rule. The active linked paragraph adds a soft violet wash; active paragraphs with no figure links stay neutral.
- **Scroll-synced figure rail.** At 1280px and above, the reading column and figure rail are centered as one group. Whichever paragraph is centered becomes active; its cited figure(s) highlight and align to the paragraph's height. Below that, the same figures live in a persistent bottom drawer. Multiple-figure paragraphs get a carousel (`‹ 1/2 ›` + dots) that resets to the first figure when the paragraph changes and preserves your choice while scrolling within it.
- **AI figure explanations (optional).** When enabled, each figure gets a 1–2 sentence plain-English note in a collapsed **In short** panel. Attribution appears once per figure area — in the rail, drawer, or lightbox — rather than on every card. Opt-in: requires both `OPENROUTER_API_KEY` and `ENABLE_EXPLANATIONS=true`; otherwise the app runs fully deterministic.
- **Full-screen lightbox.** Click any figure or table to open it at natural size. Rendered via a portal above the reading toolbar (`z-100`) so it covers the whole page.
- **Math via KaTeX.** arXiv's `<math>` TeX is extracted server-side and rendered client-side.
- **Clean citations, no bibliography jumps.** `#bib.*` links are resolved to the real source: arXiv ID → `arxiv.org/abs/…`, DOI → `doi.org/…`, otherwise a short-query Google Scholar search. The full bibliography entry shows as a tooltip; double-comma artifacts (`"Bender et al.,, 2021"`) are normalized.
- **Footnote cleanup.** arXiv HTML embeds full footnote text inside body paragraphs; the extractor strips it down to a superscript marker so the note doesn't duplicate in the text.
- **Panel merging.** Tables/figures split across multiple `<figure>` elements (container + panel) are merged into one card. Figure N and Table N are never conflated — papers number them independently.
- **Caching.** On Vercel, shared through Upstash Redis (24h TTL, versioned keys so extraction changes never serve stale payloads). Local dev uses an in-memory cache instead: Vercel-injected `KV_*` credentials are only honored on Vercel, so dev and prod never share a database. Keyed by arXiv ID, so `abs/`, `html/`, and `pdf/` links for the same paper share one entry.
- **Abuse protections.** Input validation, arXiv fetch size/type caps (5 MB), per-IP rate limiting (20 requests/minute via Upstash, when Redis is configured), and single-flight deduplication of concurrent requests for the same paper.
- **Sanitized paper HTML.** All text and table markup extracted from arXiv is allowlist-sanitized before it reaches the browser — no scripts, event handlers, `javascript:` URLs, or arbitrary styles.
- **Anonymous, single-use.** No accounts or history — paste a link, read, close.
- **Drag-and-drop.** Drop an arXiv link anywhere on the page to load it.

## How it works

### Pipeline

1. **Fetch.** The reader route resolves a canonical source/ID pair, and the API route (`src/app/api/fetch/route.ts`) server-side fetches `https://arxiv.org/html/{id}`. Papers without an HTML version return a clear error — arXiv generates HTML asynchronously for recent submissions, and some older papers never got one.
2. **Extract.** Cheerio parses title, authors, paragraphs, and figures (caption + image URL, or table HTML when the source has no image). Figure panels are merged by ID prefix; table HTML is compacted (LaTeXML `class`/`id` attributes dropped, `colspan`/layout styles kept). Paragraph and table HTML is then allowlist-sanitized (safe tags and URL schemes only), since arXiv markup derives from author-controlled LaTeX. Bibliography entries are scanned for arXiv IDs/DOIs to resolve citations. Math is replaced with `@@K{n}@@` placeholders and the raw TeX is collected for client-side KaTeX rendering.
3. **Map paragraphs → figures (regex).** A deterministic pattern matches `Figure N` / `Fig. N` / `Table N` (including ranges like `Figures 46–50`) and links them **kind-aware** — `Figure 6` and `Table 6` are distinct. This is the only mapping path: free, instant, and accurate for explicit citations.
4. **Explain figures (optional).** When both `OPENROUTER_API_KEY` and `ENABLE_EXPLANATIONS=true` are set, Meta Muse Ember via OpenRouter writes the **In short** notes — batched 8 figures per call, in parallel, from each caption plus up to three citing paragraphs. Failure-safe: if a batch fails, captions still render. The flag fails closed, so a deploy without it never calls the model.
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
# then set OPENROUTER_API_KEY=sk-or-... and ENABLE_EXPLANATIONS=true

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste an arXiv link, e.g. `https://arxiv.org/abs/2203.02155`.

### Environment variables

All optional — without any of them the app runs fully deterministically with an in-memory cache.

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Enables the Muse Ember figure explanations |
| `ENABLE_EXPLANATIONS` | Set to `true` (with `OPENROUTER_API_KEY`) to enable explanations; any other value disables them |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Injected by the Vercel Marketplace Upstash integration; ignored outside Vercel so local dev never shares the production database |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional: separate Upstash database for local dev (takes precedence over `KV_*` everywhere) |
| `STATS_TOKEN` | Bearer token that protects `GET /api/stats` |

## Deployment

Deployed on Vercel (Hobby plan). `src/app/api/fetch/route.ts` exports `maxDuration = 60` (mirrored in `vercel.json`) so explanation batches fit on large papers.

1. Import the repository into Vercel.
2. Optional: **Storage → Marketplace → Upstash Redis** (free tier) to enable the shared cache; the integration injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. Optional: set `OPENROUTER_API_KEY` + `ENABLE_EXPLANATIONS=true` for explanations; omit both to keep the deployment deterministic.

## Analytics

- **Visitors** — Vercel Web Analytics (`@vercel/analytics`, mounted in `src/app/layout.tsx`). Enable it once in the Vercel dashboard under **Analytics**. Hobby includes 50,000 events/month with a 1-month window; custom events require Pro, so this covers page views/visitors/referrers only.
- **Paper loads** — Redis counters written by `/api/fetch` on production deployments only (previews and local dev are excluded): daily totals (`stats:loads:<date>`), per-paper totals (`stats:papers` hash), cache hit/miss totals, and an error count. Read them with:

```bash
curl -H "Authorization: Bearer $STATS_TOKEN" \
  "https://paper-reader-omega.vercel.app/api/stats?days=14"
```

The response includes `loadsByDay`, `totalLoads`, `cache.hitRate`, `errors`, and the 20 most-loaded papers.

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

`npm test` runs Vitest against pinned arXiv HTML fixtures in `test/fixtures/` (gzipped, no network access). The suite covers arXiv ID/source-route parsing, extraction (paragraphs, authors, figures, tables, math, citation links, footnote stripping), table HTML compaction, HTML sanitization (XSS regression cases for links, footnotes, and tables), regex figure mapping, and client payload trimming. To refresh a fixture, download the pinned arXiv HTML version and gzip it, then update any counts that changed intentionally.

## Tech stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Lexend / IBM Plex Sans** — reading and UI typefaces via `next/font`
- **Cheerio** — server-side HTML parsing
- **sanitize-html** — allowlist sanitization of extracted paper markup
- **KaTeX** — math rendering
- **Upstash Redis** — shared deployment cache (optional)
- **Upstash Ratelimit** — per-IP API rate limiting (optional)
- **Vercel Web Analytics** — visitor analytics
- **OpenRouter** (`meta/muse-ember`) — figure explanations (optional)

## Known limitations

- **Rate limiting is per-IP, without accounts.** `/api/fetch` is an unauthenticated proxy to arXiv (and to OpenRouter only when explanations are explicitly enabled). Requests are capped at 20/minute per IP through Upstash when Redis is configured; there is no per-user quota or authentication.
- **Papers without an arXiv HTML version** return an error with an explanation. This happens with very new submissions (HTML is generated asynchronously) and some older papers; PDF fallback is not implemented.
- **Tables render inline as HTML**, not as images — that's by design (there's often no image file in the source), but very wide tables scroll inside their card.
