---
name: paper-reader
description: Use when the user wants to read a PDF-only paper in Paper Reader, or wants an invented worked-example payload for testing. This skill extracts a paper with the user's model and publishes it through Paper Reader; the server never parses the PDF.
---

# Paper Reader: bring your own model

## Start

1. If the user supplies an arXiv ID, check whether the paper has an HTML or ar5iv reader at `/read/arxiv/<id>`; prefer the deterministic version.
2. If no deterministic reader exists, or the user wants an invented example, use this skill.
3. Call `paper_format` first and use its schema and worked example.
4. Read the PDF natively with the `read` tool. If that fails, follow [rasterization] below.
5. Emit the payload, save it locally for renewal, then call `publish_paper`.
6. Return the published URL. If the server says `HTML_AVAILABLE`, use its deterministic URL instead; retry on `RATE_LIMITED` or `METADATA_UNAVAILABLE`.

## Re-publishing after expiry

Save the emitted payload to a local JSON file before publishing, such as
`paper-reader-<arxivId>.json`. Treat that file as the reusable source of
truth for the reading link. When the link expires, re-send the saved file with
`publish_paper` instead of extracting the PDF again.

## Extraction contract

- Paragraphs are `p1`, `p2`, … in reading order. Each has plain `text`, sanitized `html`, and ordered `mathTex`.
- Paragraph HTML may use only `a`, `b`, `i`, `em`, `strong`, `cite`, `sub`, `sup`, `code`, `span`, and `br`.
- Inline math is `@@K0@@`, `@@K1@@`, … in the same order as `mathTex`.
- Figures are `f1`, `f2`, …; copy captions verbatim and never invent numbers.
- A figure uses `tableHtml` or a one-based `pdfPage`, with `bbox` as normalized `[x, y, width, height]`. Do not use `imageUrl`.
- Include `paraFigureMap` only for mappings the server's regex would miss.
- `client` selects `name`, `model`, and `skillVersion` so provenance remains useful.

## Native PDF reading

Use the `read` tool with the user's PDF path. Ask for vision when the attached pages need figures or equations; do not paste PDF bytes into a prompt.

## Rasterization

When native PDF reading is unavailable, run:

```sh
node ~/.opencode/skills/paper-reader/scripts/crop-figures.mjs <paper.pdf> <output-dir>
```

If you installed the skill somewhere else, use that directory instead.

The script tries `pdftoppm`, then `mutool`, then `pdfimages`. It writes one PNG per page and a JSON manifest with normalized page rectangles. Read those PNGs with `read`, then publish page/bbox data. Rasters never leave the machine.

## Results

- `201` returns a short-lived handoff URL.
- `200` with `deduped: true` returns the previous link; do not extend it.
- `410` means the link expired; re-send the saved payload file with `publish_paper`. Do not re-read the PDF unless the paper or saved payload is stale.
- `422` means the metadata or figure source was wrong; inspect the expected values in `details` and fix the payload.
- `409 HTML_AVAILABLE` means the deterministic reader is preferable.

## Invented example

Use an invented paper only when requested for testing. Keep title, authors, and captions invented and label the example explicitly.
