#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const usage = `usage: crop-figures.mjs <paper.pdf> <output-dir>

Writes page-0001.png, page-0002.png, ... plus manifest.json.
Tries pdftoppm, then mutool, then pdfimages.
`;

const [pdfPath, outputDir] = process.argv.slice(2);

if (process.argv.length !== 4 || !pdfPath || !outputDir) {
  console.error(usage);
  process.exit(2);
}

const pdf = resolve(pdfPath);
const out = resolve(outputDir);

if (!existsSync(pdf)) {
  console.error(`PDF not found: ${pdf}`);
  process.exit(2);
}
if (extname(pdf).toLowerCase() !== ".pdf") {
  console.error("input must be a .pdf file");
  process.exit(2);
}

mkdirSync(out, { recursive: true });

function pageFile(page) {
  return `page-${String(page).padStart(4, "0")}.png`;
}

function normalizeRenderedPages() {
  const rendered = readdirSync(out)
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const pages = rendered.map((name, index) => {
    const target = pageFile(index + 1);
    if (name !== target) {
      copyFileSync(join(out, name), join(out, target));
    }
    return {
      page: index + 1,
      file: target,
      width: null,
      height: null,
      bbox: null,
    };
  });
  return pages;
}

const attempts = [
  () => {
    execFileSync("pdftoppm", ["-png", "-r", "150", pdf, join(out, "page")], {
      stdio: "pipe",
    });
  },
  () => {
    execFileSync(
      "mutool",
      ["draw", "-o", join(out, "page-%d.png"), "-r", "150", pdf],
      { stdio: "pipe" },
    );
  },
  () => {
    execFileSync("pdfimages", ["-png", pdf, join(out, "page")], {
      stdio: "pipe",
    });
  },
];

let pages = [];
for (const attempt of attempts) {
  try {
    attempt();
  } catch {
    continue;
  }
  pages = normalizeRenderedPages();
  if (pages.length > 0) break;
}

if (pages.length === 0) {
  console.error(
    "No page images were created. Install pdftoppm (poppler) or mutool.",
  );
  process.exit(1);
}

const manifest = {
  pdf: basename(pdf, extname(pdf)),
  pages,
  bboxNote:
    "Coordinates are normalized page-space [x,y,width,height]. Measure from the raster; 0,0 is the top-left.",
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${pages.length} page image(s) to ${out}`);
