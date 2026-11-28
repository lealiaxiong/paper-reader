# Paper Reader Roadmap

Status: proposal
Updated: 2026-11-23

This roadmap replaces the earlier PDF-first plan. **Bring Your Own Model (BYOM)
is now the default path for PDF-only papers:** the user's own agent (OpenCode
first, then Claude, then ChatGPT) extracts with the user's inference quota, and
the server only validates, sanitizes, hands off briefly, and renders — it never
spends a consumer subscription on the user's behalf. The deterministic HTML pipeline
still comes first; BYOM fills gaps for papers with no arXiv HTML and no ar5iv,
replacing nothing that already works.

## 1. Purpose and scope

Paper Reader should open more papers without weakening the fast, anonymous HTML
experience or overclaiming PDF-level fidelity. Five capabilities, in priority
order:

1. **ar5iv fallback — implemented.** When arXiv has no `/html` page, try
   ar5iv's LaTeXML conversion before giving up.
2. **BYOM PDF extraction — default PDF path.** The user's agent reads a PDF-only
   paper with the user's quota and publishes a structured result. v1 is arXiv-only
   and delivered through an **ephemeral, unlisted handoff** with `byom`
   provenance; the shared paper cache is never written.
3. **BYOM explanations — first transport smoke test.** The same agent backfills
   figure explanations, replacing the deploy owner's OpenRouter bill. This tests
   the skill, MCP, auth, and ingest path; it is not the PDF acceptance test.
4. **Accounts, history, private uploads — decoupled from reading.** Accounts
   gate only history, private uploads, and retention. Reading public papers,
   including PDF-only papers via BYOM, needs no account.
5. **Optional server-side PDF fallback — demoted and decision-gated.** Exists
   only for users without an agent, and only if M0/M9 metrics justify it. Ships
   near the end, if at all.

**Non-goals:** OCR for scanned PDFs; **deterministic (non-BYOM) formula and
table reconstruction** from PDF; a server-side PDF layout engine. BYOM still
does this best-effort: the user's model emits TeX and sanitized `tableHtml`.
A PDF pane may show original pages, but that is a viewer and a crop source, not
a layout engine. Non-arXiv sources (DOI, OpenReview, generic uploads) are out of
v1; the BYOM contract is what unlocks them later.

## 2. Guiding principles

- **Deterministic first.** arXiv HTML and ar5iv are always tried before any
  model. BYOM never outranks HTML or ar5iv, and the regex figure map is always
  recomputed server-side.
- **BYOM is the default for PDFs.** When only a PDF exists and the user has an
  agent, the agent extracts; the server does not burn its own quota by default.
- **Anonymous reading stays anonymous.** Public papers need no account,
  including PDF-only papers extracted through the user's own agent.
- **Accounts are identity-bound, not reading-bound.** An account unlocks
  history, private uploads, and retention — never permission to read public
  content.
- **Two trust boundaries.** arXiv markup is author-controlled and untrusted;
  BYOM output is model-controlled and equally untrusted. Both cross the same
  sanitize-and-validate boundary on ingress.
- **Honest provenance.** Every paper shows whether it came from arXiv HTML,
  ar5iv, BYOM, or a server converter, and always offers the original PDF.
- **Canonical URLs and versioned cache.** One stable route per paper; cache keys
  carry a version so extraction changes never serve stale payloads.
- **Do not build a PDF engine unless necessary.** Prefer the agent, then the
  original-PDF pane, then a decision-gated server fallback.

## 3. Assumptions and constraints

- **A subscription is not API access.** Claude, ChatGPT, and OpenCode plans cannot
  be spent from our server; extraction happens in the user's client and the
  server receives only structured results.
- **BYOM payloads are untrusted, ephemeral, unlisted.** They may contain injected
  markup, fabricated captions, oversized fields, or hostile URLs; treat every
  field as hostile input.
- **Server-side PDF extraction is a fallback, not the default.** It carries real
  cost and quality risk, so it is gated on observed need.
- **Accounts can ship after PDF coverage.** Because BYOM reading is anonymous,
  accounts are not a prerequisite for the flagship PDF path.
- **PDF-derived reading degrades.** Equations, tables, footnotes, and vector
  figures may be missing or approximate; every degraded path says so.
- **v1 is arXiv-only.** The first real BYOM extraction test is arXiv papers with
  no HTML and no ar5iv.

## 4. Current baseline

Implemented today (per README and the code):

- Canonical `/read/arxiv/{id}` routes with refresh, share, and back/forward
  navigation; invalid routes 404.
- Server fetch of `https://arxiv.org/html/{id}` with ar5iv fallback and
  redirect/no-content detection, so abstract pages are never treated as papers.
- LaTeXML extraction of title, authors, paragraphs, figures, tables, math,
  citations, and bibliography links, with allowlist sanitization
  (`PARAGRAPH_SANITIZE`, `TABLE_SANITIZE` in `src/lib/paper.ts`).
- Deterministic paragraph-to-figure mapping via `buildRegexFigureMap`,
  kind-aware for `Figure N` versus `Table N`.
- Source-aware cache, stats, per-IP rate limiting, API validation, and
  single-flight deduplication. Cache keys carry `CACHE_VERSION` and a 24-hour
  TTL (`src/lib/cache.ts`); local dev uses memory.
- Anonymous-only usage: no database, accounts, sessions, uploads, or history.
- Optional OpenRouter explanations (`meta/muse-ember`) behind
  `OPENROUTER_API_KEY` and `ENABLE_EXPLANATIONS=true`; the flag fails closed.

Missing today: BYOM ingest, schema validation, ephemeral handoff; an
OpenCode skill or MCP server; provenance UI, a PDF pane, or page mapping;
accounts, history, and private uploads; any server-side PDF fetch, parse, or
render path; a visible distinction between structured HTML and PDF-derived
content.

## 5. Deterministic-first decision tree

1. **arXiv HTML exists** → deterministic extractor (`processPaper`), regex
   figure map, provenance `arxiv-html`.
2. **Else ar5iv exists** → same deterministic extractor against ar5iv markup,
   provenance `ar5iv`.
3. **Else PDF-only:**
   - **Agent available** → BYOM. The skill reads the PDF and publishes via MCP;
     the server validates, hands off ephemerally, and renders, provenance `byom`.
     Anonymous allowed.
   - **Else server fallback enabled and user signed in** → server converter,
     provenance `server-pdf`. Demoted path.
   - **Else** → an honest typed error plus **Open original PDF**. Never a
     silently empty reader.
4. **Explanations:** BYOM backfill first (user quota); server OpenRouter remains
   optional and fail-closed. Paragraph→figure mapping is always deterministic,
   regardless of who wrote the explanations.

## 6. Capability matrix

| Capability | Anonymous | Signed in |
| --- | --- | --- |
| Read arXiv HTML | Yes | Yes |
| Read ar5iv fallback | Yes | Yes |
| Read a PDF-only arXiv paper via BYOM | Yes | Yes |
| Read a PDF-only arXiv paper via server fallback | No, sign-in prompt | Yes |
| Read a PDF you already have, via BYOM | Yes | Yes |
| Private upload plus storage | No | Yes |
| Reading history | No | Yes |
| Explanations via your own agent | Yes | Yes |
| Explanations server-side (OpenRouter) | Existing flag | Existing flag |

## 7. Two-track architecture plus optional fallback

**Track A — deterministic (unchanged).** `src/lib/source-loader.ts` resolves the
source; `fetchPaperHtml` fetches arXiv then ar5iv; `processPaper` extracts and
sanitizes; `buildRegexFigureMap` maps paragraphs to figures; the result is
cached with `arxiv-html` or `ar5iv` provenance.

**Track B — BYOM (new default for PDFs).** The user's agent runs the
`paper-reader` skill, reads the PDF natively (or via rasterized pages), emits a
`ReaderPayload`-shaped body, and calls local MCP tools. The MCP server posts to
our ingest route, which validates, re-sanitizes, recomputes the map, stores the
result in an **ephemeral handoff namespace** with `byom` provenance and a short
TTL, and returns an unlisted capability URL. It never writes the shared paper
cache. The existing reader renders it unchanged.

**Track C — optional server converter (decision-gated).** For signed-in users
without an agent, a flagged `PdfConverter` may share the same payload shape and
trust boundary, starting only if M0 and M8 metrics justify it.

Shared shape: `ReaderData`/`ReaderPayload` in `src/lib/types.ts` gain `format`
(`html` | `pdf`), `provenance` (`arxiv-html` | `ar5iv` | `byom` | `server-pdf` |
`upload`), extraction metadata, `warnings`, and `attribution`. Track B never
introduces a generic `ext` source or writes the deterministic cache in v1; it
serves through the handoff URL and differs only in provenance.

## 8. Sequence at a glance

| Milestone | User-facing outcome | Auth required | New dependency | Size |
| --- | --- | --- | --- | --- |
| M0 | Decisions and spikes; gate on whether server PDF is ever needed | No | None | S |
| M1 | Missing arXiv HTML falls back to ar5iv (implemented) | No | ar5iv availability | S–M |
| M2 | BYOM foundation: validated, sanitized, provenance-tagged ingest | Optional | Redis (existing), schema validation | M |
| M3 | OpenCode skill plus local MCP; PDF-only arXiv paper to URL | No | `paper-reader-mcp`, poppler/pdfjs-dist | L |
| M4 | BYOM explanations replace server OpenRouter spend | No | None new | S–M |
| M5 | In-app PDF pane, page-level sync, provenance UX | No | `pdfjs-dist` | M |
| M6 | Accounts and reading history, decoupled from reading | Yes (for history) | Auth + Postgres | M–L |
| M7 | Private uploads for BYOM | Yes | Private blob storage | M–L |
| M8 | Optional server PDF fallback (decision-gated) | Yes | `PdfConverter` + parser | L |
| M9 | Hardening, observability, staged rollout | Mixed | Observability, quotas | M |

## 9. Milestones

### M0 — Decisions and spikes

**Status:** Partial: transport order, handoff shape, and the M8 policy are
decided. The empirical spikes remain; the explanations smoke test is unblocked
by M2.

**Goal:** Reduce uncertainty before committing to BYOM, the PDF pane, or any
server converter.

**Tasks:**

- **BYOM quality/time spike.** On roughly 20 PDF-only arXiv papers, run the
  OpenCode skill draft end to end; measure paragraph quality, caption fidelity,
  figure recovery, time, token spread, and failure modes.
- **Degradation study.** On papers with both HTML and PDF, compare results;
  confirm BYOM does not beat HTML and record where it is worse.
- **Explanations transport smoke test.** Prove skill + MCP + auth + ingest on an
  existing paper before PDF extraction; this is not the PDF acceptance test.
- **PDF pane spike.** Prototype an in-app pane and a server-derived page map
  from paragraph text using per-page text from `pdfjs-dist`; confirm sync
  accuracy and mobile behavior.
- **Transport and handoff design.** Choose local stdio first, then remote HTTP;
  settle an ephemeral unlisted handoff (unguessable capability URL, short TTL),
  with no shared BYOM cache and no server-stored PDFs.
- **Server-PDF gate.** Explicitly decide whether M8 is ever needed, based on the
  share of users without an agent and observed failures.

**Likely files:** `docs/bring-your-own-model.md` (spike notes), follow-up notes
here, throwaway scripts under `scripts/`.

**Acceptance criteria:** Documented spike numbers, a chosen transport order, a
chosen handoff design, and a written M8 gate decision.

**Risks:** A small sample may mislead; OpenCode availability may bias the
audience; PDF pane sync may be harder than the spike suggests.

### M1 — ar5iv fallback

**Status:** Implemented; kept compressed as the deterministic-first reference.

**Goal:** Papers with no arXiv `/html` but with TeX source open in the existing
reader.

**Acceptance (retained):** arXiv success does not trigger an ar5iv request;
arXiv 404 → ar5iv 200 is covered by a test; both-provider failure returns a
clear "no HTML available" error; redirect/no-content pages are rejected; relative
images resolve against the serving provider; existing fixtures pass unchanged;
the reader still cites the canonical arXiv paper.

**Risks (retained):** ar5iv lags the newest submissions, may serve a different
version, and is a third-party dependency with its own rate limits.

### M2 — BYOM foundation (arXiv-only)

**Status:** Server foundation implemented: shared BYOM types, publisher auth,
ephemeral TTL store with publisher-scoped dedupe, payload validation and
sanitization, arXiv metadata cross-check, HTML-availability refusal, publish/
handoff/delete routes, and `?h=` rendering with a provenance badge. Figure
crops from the streamed PDF (M5 slice) are shipped via `/api/pdf/arxiv/<id>`
plus PDF.js; the full PDF pane and the explanations overlay (M4) remain
pending.

**Goal:** Accept a model-produced payload safely and deliver it through an
ephemeral handoff without touching the deterministic path.

**Tasks:**

- Add `POST /api/publish` with bearer auth (`PUBLISH_TOKENS`); derive a
  `publisherId` per token for ownership and scoped dedupe.
- Validate the body against a schema (max paragraphs, figures, bytes per field
  and overall, allowed keys only). Cap payload size and rate-limit the publish
  route via `src/lib/ratelimit.ts`.
- Validate figures: reject `imageUrl` in v1; require `tableHtml` or
  `pdfPage`/`bbox` (bounds-checked) for client-side rendering.
- Cross-check title/authors against the arXiv metadata API; reject mismatches
  (`ARXIV_METADATA_MISMATCH`) and fail closed when the API is down.
- Re-sanitize every `paragraphs[].html` with `PARAGRAPH_SANITIZE` and every
  `tableHtml` with `TABLE_SANITIZE`. Never trust model HTML.
- Recompute `paraFigureMap` with `buildRegexFigureMap`; merge model mappings
  only for paragraphs regex misses, never overriding a deterministic match.
- Store in an **ephemeral handoff namespace** with `byom` provenance and a short
  TTL. Never write `paper:*`; do not introduce a generic `ext` source in v1.
  Refuse the publish when deterministic HTML/ar5iv already exists.
- Add tests for malicious payloads (script tags, event handlers, `javascript:`
  URLs, oversized fields) and sanitization regressions.

**Likely files:** `src/app/api/publish/route.ts`, `src/app/api/handoff/[slug]/route.ts`,
`src/lib/paper.ts` (export reusable sanitizers and `buildRegexFigureMap`),
`src/lib/types.ts` (provenance/format fields), a new `src/lib/handoff.ts`
(ephemeral store + TTL), `src/lib/sources.ts` (keep arXiv-only),
`src/lib/source-loader.ts` (merge a handoff payload only when its capability
slug is present).

**Acceptance criteria:** A published payload renders through its handoff URL with
`byom` provenance and a badge; deterministic HTML still wins when present; the
shared `paper:*` cache is never written; malicious payloads are rejected or
neutralized; handoff expiry is verified; external `imageUrl` is rejected and
figures render from `pdfPage`/`bbox`.

**Risks:** Plausible-but-wrong model output; schema drift between skill and
server; handoff links leaking or expiring mid-read.

### M3 — OpenCode skill plus local MCP

**Status:** `paper-reader-mcp` stdio service with `paper_format` and
`publish_paper`, the OpenCode skill, and rasterization helper are shipped.
`publish_explanations` remains a documented placeholder until the server
overlay endpoint exists; `pdfPage`/`bbox` figures now render their crops from
the streamed PDF (full-page fallback when the box is missing or invalid).

**Goal:** A developer can point OpenCode at a PDF-only arXiv paper and get a
working reader URL, with no account.

**Tasks:**

- Build `paper-reader-mcp` as a local stdio server exposing `paper_format`,
  `publish_paper`, and `publish_explanations`.
- Ship `.opencode/skills/paper-reader/SKILL.md` with the BYOM contract rules,
  plus `scripts/crop-figures.mjs` for page rasters to help the model read
  (`pdftoppm`/`pdfimages`/`mutool`). Rasters are not uploaded.
- Support native PDF reading first, with poppler rasterization as fallback for
  providers that cannot take PDFs.
- Emit math as `@@K{n}@@` placeholders with ordered TeX; copy captions verbatim;
  use `p1…`, `f1…` ids and `pdfPage`/`bbox` for figures.
- Publish, return the URL, document `opencode.json` setup, and prove the
  end-to-end path on a PDF-only arXiv paper.

**Likely files:** new `packages/paper-reader-mcp/` (or `mcp/`) with the stdio
server, `.opencode/skills/paper-reader/` with the skill and scripts, docs
updates, and a small worked example with invented content.

**Acceptance criteria:** A clean machine can install the MCP server, add the
skill, run one command, and open the resulting handoff URL with figures rendered
from the streamed PDF and with provenance. No server-side PDF parsing is involved.

**Risks:** Provider-specific PDF handling; poppler availability across OSes;
bbox accuracy; users expecting a web upload instead of a CLI flow.

### M3x — BYOM citation parity (follow-up)

**Status:** **Not yet specced.** No implementation has been started; this
item records the requested follow-up only.

**Goal:** Citation parity between BYOM and deterministic HTML papers: BYOM
reader pages include the bibliography/citation experience currently produced
for HTML papers.

**Tasks:**

- Define how the skill extracts citations and bibliography entries from PDFs.
- Extend the MCP contract and payload schema so citations can travel from the
  skill to the publish endpoint.
- Extend server validation/sanitization and the BYOM rendering path so the
  reader can display citations and bibliography links.
- Keep deterministic HTML/ar5iv extraction and its resolved citation links
  unchanged.

**Acceptance criteria:**

- A PDF-only paper published through the skill shows citation-related content
  with parity to the HTML reader.
- Bibliography/citation links are validated and sanitized like other BYOM
  fields.
- Missing citations degrade gracefully without blocking reading.

**Likely files (at implementation time):** `src/lib/types.ts`,
`src/lib/handoff-payload.ts`, `mcp/src/publish.ts`,
`.opencode/skills/paper-reader/SKILL.md`, and reader rendering components.

**Risks:** Citation extraction quality varies across PDF styles; duplicate or
incomplete references; schema drift between the skill, MCP, and server.

**Open questions:**

- Which citation fields and link targets are required for parity?
- Whether citations travel as first-class payload fields or embedded in
  paragraph HTML.
- Whether the reader should show a bibliography section, citation tooltips,
  or both.

### M4 — BYOM explanations

**Goal:** Replace the deploy owner's OpenRouter bill with the user's own quota,
without mutating the shared deterministic cache.

**Tasks:**

- Implement `publish_explanations(paperUrl, { f1: "…" })` on MCP plus an ingest
  route that writes an **ephemeral explanation overlay** tied to the paper, and a
  skill/command that regenerates explanations. Merge the overlay at render time.
- Keep server-side OpenRouter optional, fail-closed, and never required.
- Optionally let the app keep glosses in `localStorage` keyed by arXiv ID.

**Likely files:** MCP server, `src/app/api/publish/route.ts` (or a sibling
route), `src/lib/paper.ts` (`buildFigureExplanations` stays the server
fallback), the ephemeral overlay store and a merge-at-render helper.

**Acceptance criteria:** With OpenRouter disabled, a paper can receive
user-supplied explanations and render them via the overlay; the deterministic
map is unchanged; no explanation write touches `paper:*` or alters paragraphs or
the map.

**Risks:** Partial backfills; explanation quality varies by provider; overlay
and deterministic version drift.

### M5 — PDF pane, page-level sync, and provenance UX

**Goal:** Show the original PDF beside the reflowed text so readers can verify
what the model produced, without framing an external viewer.

**Tasks:**

- Add an in-app PDF pane or toggle. It is **not** an iframe and **not** a
  separate browser tab.
- Derive the page map **server-side and deterministically** from paragraph text
  and per-page text extracted with `pdfjs-dist` (the model never supplies page
  numbers), reusing the same PDF.js infrastructure that renders figure crops.
- Add `GET /api/pdf/arxiv/<id>` as a streaming proxy (no persistence), used by
  the PDF pane and for `pdfPage`/`bbox` figure crops.
- Implement reader→PDF scroll sync at page granularity (MVP), with a "follow"
  toggle so readers can detach.
- Provide a mobile switch between text and PDF, an "Open original PDF" action
  wherever the pane is available, and TTL/share/expiry cues for unlisted entries.

**Likely files:** `src/app/read/[source]/[...id]/page.tsx`, pane/sync components
under `src/components/`, `src/lib/pdf-page-map.ts`, and `next.config.ts` for
worker/CSP needs.

**Acceptance criteria:** Page sync is text-derived, not model-supplied; the
follow toggle and mobile switch work; keyboard and screen-reader access is
preserved; the pane degrades gracefully when no PDF is available.

**Risks:** Text-to-page alignment drifts on multi-column papers; PDF.js worker
packaging; sync jank; mobile performance.

### M6 — Accounts and reading history (decoupled)

**Goal:** Add identity for history, private uploads, and retention — never as a
gate on public reading.

**Tasks:**

- Choose an auth/database provider and add server-only `getCurrentUser()` /
  `requireUser()` helpers.
- Add a history table for arXiv, BYOM, and upload entries, recording source,
  paper ID, title, format, provenance, and last-opened time.
- Add a history view with open, remove, and clear-all actions, plus delete-account
  and data-export flows.
- Write row-level security policies and tests proving cross-account isolation.
- Add feature flags and UI tests proving anonymous reading is unchanged.

**Likely files:** auth helpers in `src/lib/`, new `src/app/account/` and history
UI, database migrations, API routes under `src/app/api/history/`.

**Acceptance criteria:** Same history across devices; no cross-user reads;
anonymous reads create no rows; auth failure never blocks reading; deletion
removes data and storage.

**Risks:** Accidentally turning reading into an account wall; RLS mistakes;
auth UX and email deliverability.

### M7 — Private uploads for BYOM

**Goal:** A signed-in user can read a PDF they have access to, via their own
agent, without the server parsing it.

**Tasks:**

- Add a signed upload target to private blob storage; the browser uploads
  directly, never through a normal API body.
- Let the agent read the private PDF via a short-lived signed URL and publish an
  owner-scoped result. Do **not** add server-side parsing; extraction stays in
  the agent.
- Add retention defaults, delete and takedown paths, and per-user quotas;
  enforce ownership checks on every read of the document.

**Likely files:** `src/app/api/uploads/`, storage helpers, an owner-scoped upload
source in the reader route, and database migrations.

**Acceptance criteria:** Only the owner can open the document; delete removes the
document and history; the original PDF is reachable only through a signed URL;
no other user can enumerate it.

**Risks:** Storage cost and orphan cleanup; signed-URL leakage; copyright and
acceptable-use policy.

### M8 — Optional server-side PDF fallback (decision-gated)

**Goal:** Cover users who have no agent, **only if** M0/M9 metrics prove the
need. Heavily deprioritized.

**Tasks (only after the gate):**

- Define a `PdfConverter` interface returning the shared `ReaderData` shape.
- Require sign-in (typed `PDF_AUTH_REQUIRED` for anonymous) and rate-limit per
  user in addition to per IP.
- Fetch the arXiv PDF with content-type, `%PDF-`, byte, page, and timeout caps.
- Extract text and captions best-effort; use `pdfPage`/`bbox` crops rendered
  client-side for vector figures.
- Cache by parser version; keep entries short-lived so real HTML supersedes.
- Add a labeled banner, warnings, and an "Open original PDF" link on every
  result.

**Likely files:** `src/lib/pdf/` behind dynamic imports,
`src/app/api/fetch/route.ts`, `src/lib/cache.ts` (parser-versioned keys),
`next.config.ts` (`serverExternalPackages` for native dependencies).

**Acceptance criteria:** The M0 gate is met; a signed-in user can open a sampled
PDF-only paper; anonymous users get a clear sign-in prompt; failures are
actionable, never silently empty.

**Risks:** Reading order and table/equation fidelity; native dependency
packaging on Vercel; latency and cold starts; cost of parsing everything on the
server.

### M9 — Hardening, observability, and rollout

**Goal:** Make every path operable, measurable, and safe before broad exposure.

**Tasks:**

- Add metrics: provider mix (HTML vs ar5iv vs BYOM vs server PDF), BYOM publish
  success, sanitize rejections, handoff expiry counts, and user vs server
  explanation backfills.
- Add per-user quotas where accounts exist, plus feature flags for BYOM ingest,
  the PDF pane, server PDF, and uploads.
- Review CSP for ar5iv images and PDF workers.
- Write runbooks, retention/takedown policy, and a rollback drill.
- Confirm privacy posture: do not log payloads or PDF URLs; do not train on
  user content.

**Likely files:** `src/lib/stats.ts`, `src/app/api/stats/route.ts`,
`src/lib/ratelimit.ts`, `next.config.ts`, deployment docs and `.env.example`.

**Acceptance criteria:** Stats answer which provider served each load and how
often BYOM publishes fail; a flag can disable any new path without disabling the
app; anonymous reading survives incidents; a rollback drill has run.

**Risks:** Metrics blind spots; quota tuning; flag complexity.

## 10. Cache and ephemeral handoff

The deterministic cache keeps its current behavior: one authoritative entry per
paper (`paper:v{N}:arxiv:{id}`, 24-hour TTL, `src/lib/cache.ts`), and it is the
only thing the app reads for arXiv HTML and ar5iv. BYOM does not touch it.

Pre-accounts, BYOM uses a **handoff, not a cache**:

- **Ephemeral, unlisted namespace.** `POST /api/publish` writes `handoff:<slug>`
  with a short TTL, roughly 1–6 hours. The slug is an unguessable capability URL;
  nothing is discoverable by paper ID.
- **No shared BYOM cache.** Because entries are scoped and short-lived, there is
  no cross-user poisoning, no precedence contest, and no supersession problem:
  deterministic HTML wins trivially because BYOM was never in `paper:*`.
- **Publish refuses when HTML/ar5iv exists.** The skill should use the
  deterministic reader; the server rejects a BYOM publish for a paper that
  already has HTML.
- **No stored PDFs or assets.** The PDF pane streams the public arXiv PDF on
  demand and persists nothing. Figures render from `pdfPage`/`bbox` in the
  streamed PDF, so there are no crops to clean up.
- **Glosses are ephemeral too.** `publish_explanations` writes an overlay that is
  merged at render time, with an optional `localStorage` mirror keyed by arXiv
  ID. The shared deterministic cache is never rewritten.
- **No active HTML recheck.** The short TTL plus the publish-time HTML check
  bounds how long a BYOM page can outlive newly available HTML.
- **Lifecycle.** Bump the handoff schema version to invalidate everything; add an
  admin delete-by-slug for abuse. Split stats by provenance and count handoff
  hits, expiries, and publish rejections.
- **When accounts land.** Promote to durable per-user storage (history) and, if
  desired, validated community entries. That is the first point where a shared
  BYOM cache makes sense.

Known v1 trade-off: handoff links expire, so a reader must re-run their agent
after the TTL. That is the intended price of staying anonymous and cache-free.

## 11. Cross-cutting work

**Content/API contract.** Add `format`, `provenance`, extraction metadata,
`warnings`, and `attribution` to the shared payload. Return typed errors:
`NO_HTML_OR_PDF`, `BYOM_INVALID_PAYLOAD`, `BYOM_TOO_LARGE`, `BYOM_RATE_LIMITED`,
`PDF_AUTH_REQUIRED`, `PDF_TOO_LARGE`, `PDF_ENCRYPTED`, `PDF_CONVERSION_FAILED`.
Keep responses backward-compatible during rollout.

**Source abstraction.** `arxiv` is public and deterministic-first; future `ext`
and `upload` sources stay private or BYOM-scoped and never parse as public arXiv
IDs. Keep canonical URLs centralized in `src/lib/sources.ts`.

**Trust and sanitization.** arXiv HTML and BYOM output cross the same boundary:
validate shape, re-sanitize with `PARAGRAPH_SANITIZE`/`TABLE_SANITIZE`, recompute
the regex map, validate figure sources (`tableHtml` or `pdfPage`/`bbox`; no
external `imageUrl`), cap sizes, and rate-limit publishes. Model HTML never
bypasses `sanitize-html`.

**Auth boundary.** Public reading never depends on auth. Server-only helpers gate
history, uploads, and server PDF; never rely on client-side gating for private
files.

**Determinism guardrails.** Recompute the regex map; BYOM may only fill gaps.
Derive page maps from text, not model claims, and bump cache versions on
extraction changes.

**Accessibility.** Announce BYOM status, pane mode, and sync state to assistive
technology; do not rely on color alone; keep toolbar, history, and account
controls keyboard accessible.

**Privacy and legal.** BYOM payloads and uploads are user content: do not log or
train on them, and define retention and deletion. Respect arXiv terms and show
attribution.

## 12. Later / explicitly deferred

- OCR for scanned PDFs.
- Deterministic (non-BYOM) formula and table reconstruction from PDF. BYOM
  already emits best-effort TeX and sanitized `tableHtml`; a faithful converter
  is a separate layout-analysis effort. Prefer arXiv TeX source if pursued.
- Reading progress/resume, collections, tags, and annotations.
- Sharing uploads between users.
- A pure PDF viewer as the primary mode, or server-side PDF for everyone.
- Non-arXiv sources (largely unlocked by the BYOM contract once v1 proves out).

## 13. Open decisions

1. **Client rollout order and transport.** OpenCode local stdio first, then
   remote HTTP for Claude/ChatGPT. Confirm timing.
2. **M8 trigger threshold.** What adoption or failure rate justifies a server
   converter?
3. **Upload retention defaults.** Fixed TTL vs. user-pinned storage.
4. **Bbox accuracy.** How reliable `pdfPage`/`bbox` is on vector figures; the
   fallback is a full page.
5. **Capability links in URLs.** Whether to move `h`/`e` into fragments and
   exchange them for a cookie.
6. **Rasterization dependency.** Whether to require poppler for non-PDF providers
   or ship a JS-only fallback.
7. **Distribution.** npm-only first, then skill marketplaces/installers.

## 14. Success metrics

- PDF-only coverage via BYOM: share of previously failing papers that now open.
- BYOM citation parity: share of published PDF-only papers whose inline citations/bibliography match the deterministic reader’s coverage.
- BYOM publish success rate and sanitize rejection rate.
- Traffic split: deterministic (arXiv HTML/ar5iv) vs BYOM vs server PDF.
- Explanations supplied by users vs served through OpenRouter.
- History adoption and return rate; storage cost per active reader.
- Security: zero cross-user access or public private uploads.

## 15. Release gates per milestone

- **M2:** publish after malicious-payload, sanitization regression, no-`paper:*`-write,
  and handoff expiry tests.
- **M3:** publish after a clean-machine end-to-end run (install MCP, add skill,
  extract a PDF-only arXiv paper, open the URL).
- **M4:** publish after a run with OpenRouter fully disabled.
- **M6:** publish after auth isolation tests and an anonymous regression suite.
- **M7:** publish after private upload access tests and delete/cleanup
  verification.
- **M8:** publish only after the M0 gate is met and adoption data supports it.
- **M9:** required before removing beta flags or broadening any new path.
