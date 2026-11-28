# Changelog

All notable changes to Paper Reader are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is in `0.x`, breaking user-facing changes may ship in a minor
release.

## [0.3.1] - 2026-11-28

### Fixed

- Mobile figure drawer: the bottom sheet is now capped to the viewport,
  cards are top-aligned with per-card vertical scrolling, and the drawer
  uses a compact card (smaller media, caption clamped to 4 lines with the
  full text in the lightbox), so a tall figure or long caption can no
  longer push the sheet past the screen and hide neighboring figures.

## [0.3.0] - 2026-11-27

**BYOM = Bring Your Own Model.** Instead of Paper Reader paying for model
inference on its server, the reader’s own AI agent reads a PDF-only arXiv
paper with the user’s quota and sends a validated JSON payload to Paper Reader,
which stores it briefly as an ephemeral handoff and renders it in the
existing reader.

### Added

- BYOM figure rendering: a streamed `/api/pdf/arxiv/<id>` proxy feeds PDF.js,
  which crops `pdfPage`/`bbox` figures from the public arXiv PDF client-side
  (full-page fallback when the box is missing or invalid). No PDF bytes are
  stored.
- BYOM observability: publish success/failure, sanitization rejection, and
  handoff hit/expiry counters are recorded on production and exposed through
  `/api/stats` as `byom`.
- Public `/docs/pdf-only` guide with the hosted deployment URL, prerequisites,
  the OpenCode skill/MCP setup, and appendices for the API and running locally.

### Changed

- The content security policy now allows the PDF.js worker (`worker-src`) and
  WASM decoders (`wasm-unsafe-eval`) needed for in-browser PDF rendering.
- Publishing is beta-gated by operator-issued `PUBLISH_TOKENS`; there is no
  self-serve signup in this version.

## [0.2.0] - 2026-11-21

### Added

- ar5iv fallback for papers without an arXiv HTML version, including
  provider-aware image URLs, title cleanup, and no-content detection.
- Public `/changelog` page rendered from this file, with versioned footer links
  on the landing and changelog pages.

### Changed

- ar5iv image hosts are allowed by the content security policy.
- Documented Semantic Versioning and the release process.

### Removed

- Drag-and-drop URL loading; the header form and example links remain.

## [0.1.0] - 2026-11-21

### Added

- Focused 650px reading column with a scroll-synced figure rail on wide screens
  and a persistent figure drawer on smaller screens.
- Canonical `/read/arxiv/{id}` routes, source-aware API contracts, and invalid
  route handling.
- Figure and table extraction, panel merging, carousel navigation, and a
  full-screen lightbox.
- KaTeX-rendered math, resolved citation links, and cleaned inline footnotes.
- Optional plain-English figure explanations through Muse Ember, disabled
  unless explicitly configured.
- Landing page with reader preview and example papers.
- Shared Upstash Redis caching, usage stats, rate limiting, and single-flight
  request deduplication.
- Fixture-based extraction tests with sanitization and XSS regression coverage.

### Changed

- Replaced LLM-based paragraph-to-figure mapping with deterministic regex
  mapping.
- Adopted the warm editorial design with Lexend reading text and IBM Plex Sans
  interface text.
- Moved deployments to Vercel with a 60-second API route budget.

### Fixed

- Figure carousel state resets without effect-driven state updates.
- Local development no longer shares the production Redis database.
- Clearer errors for papers without an arXiv HTML version.

### Security

- Allowlist-sanitized paragraphs and table HTML.
- Fail-closed figure explanations and per-IP API throttling.

## Versioning

- **Major** versions introduce breaking changes to public URLs, user data, or
  supported workflows.
- **Minor** versions add backward-compatible features.
- **Patch** versions contain fixes, performance work, documentation, and
  dependency updates.

Releases are cut from `main` after the changelog and package version are
updated, tests pass, and the production deployment is verified. Each release
gets an annotated git tag (`vX.Y.Z`) and a GitHub Release with concise release
notes; the changelog remains the complete record.

[0.3.1]: https://github.com/lealiaxiong/paper-reader/releases/tag/v0.3.1
[0.3.0]: https://github.com/lealiaxiong/paper-reader/releases/tag/v0.3.0
[0.2.0]: https://github.com/lealiaxiong/paper-reader/releases/tag/v0.2.0
[0.1.0]: https://github.com/lealiaxiong/paper-reader/releases/tag/v0.1.0
