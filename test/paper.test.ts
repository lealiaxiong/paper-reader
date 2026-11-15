import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  buildRegexFigureMap,
  extractArxivId,
  extractPaper,
  toClientPayload,
} from "@/lib/paper";
import type { Figure, Paragraph, ReaderData } from "@/lib/types";

/**
 * Fixtures are pinned arXiv HTML versions (fetched with `curl`, gzipped) so
 * extraction is deterministic and tests never touch the network. If arXiv
 * markup changes, refresh the fixture deliberately and update the expectations
 * below — that diff is the point.
 */
function loadFixture(name: string): string {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return gunzipSync(readFileSync(url)).toString("utf8");
}

let instructgpt: ReaderData | undefined;
function ig(): ReaderData {
  // 2203.02155v1 — InstructGPT. 183 paragraphs, 62 figures (39 HTML tables),
  // 21 math paragraphs. The canary for table/figure dedup and citation links.
  return (instructgpt ??= extractPaper(
    loadFixture("2203.02155v1.html.gz"),
    "2203.02155",
  ));
}

let muse: ReaderData | undefined;
function mg(): ReaderData {
  // 2610.24628v2 — math-heavy paper with heavy footnote usage.
  return (muse ??= extractPaper(
    loadFixture("2610.24628v2.html.gz"),
    "2610.24628",
  ));
}

describe("extractArxivId", () => {
  it("extracts IDs from abs/html/pdf/export URLs", () => {
    expect(extractArxivId("https://arxiv.org/abs/2401.12345")).toBe("2401.12345");
    expect(extractArxivId("https://arxiv.org/html/2401.12345v2")).toBe(
      "2401.12345",
    );
    expect(extractArxivId("https://arxiv.org/pdf/2401.12345.pdf")).toBe(
      "2401.12345",
    );
    expect(extractArxivId("https://arxiv.org/export/2401.12345")).toBe(
      "2401.12345",
    );
  });

  it("extracts bare IDs, with or without version", () => {
    expect(extractArxivId("2401.12345")).toBe("2401.12345");
    expect(extractArxivId("  2401.12345v3  ")).toBe("2401.12345");
  });

  it("returns null for non-arXiv input", () => {
    expect(extractArxivId("https://example.com/abs/2401.12345")).toBeNull();
    expect(extractArxivId("not a url")).toBeNull();
    expect(extractArxivId("")).toBeNull();
  });

  it("does not match old-style IDs (only new-style YYMM.NNNNN supported)", () => {
    expect(extractArxivId("https://arxiv.org/abs/hep-th/9901001")).toBeNull();
  });
});

describe("extractPaper (InstructGPT fixture)", () => {
  it("extracts title, authors, and paragraph count", () => {
    const paper = ig();
    expect(paper.title).toContain(
      "Training language models to follow instructions",
    );
    expect(paper.authors).toHaveLength(21);
    expect(paper.authors[0]).toBe("Long Ouyang");
    expect(paper.paragraphs).toHaveLength(183);
  });

  it("extracts figures and merged tables with stable labels", () => {
    const paper = ig();
    expect(paper.figures).toHaveLength(62);
    expect(paper.figures.filter((f) => f.imageUrl)).toHaveLength(23);
    expect(paper.figures.filter((f) => f.tableHtml)).toHaveLength(39);
    expect(paper.figures.slice(0, 6).map((f) => f.label)).toEqual([
      "Figure 1",
      "Figure 2",
      "Table 1",
      "Table 2",
      "Table 3",
      "Figure 3",
    ]);
    for (const f of paper.figures) {
      expect(f.id).toMatch(/^f\d+$/);
      if (f.imageUrl) {
        expect(f.imageUrl).toMatch(/^(https?:\/\/|data:)/);
      }
    }
  });

  it("compacts table HTML: no dead class/id attrs, layout attrs kept", () => {
    const tables = ig().figures.filter((f) => f.tableHtml);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(t.tableHtml).toMatch(/^<table/);
      expect(t.tableHtml).not.toMatch(/\s(class|id)=/);
    }
    // colspan and inline styles survive compaction
    expect(tables.some((t) => t.tableHtml?.includes("colspan"))).toBe(true);
    expect(tables.some((t) => /\sstyle=/.test(t.tableHtml ?? ""))).toBe(true);
  });

  it("replaces math with placeholders and collects TeX", () => {
    const paper = ig();
    const mathParas = paper.paragraphs.filter((p) => p.mathTex.length > 0);
    expect(mathParas.length).toBeGreaterThan(15);
    const totalTex = paper.paragraphs.reduce(
      (n, p) => n + p.mathTex.length,
      0,
    );
    expect(totalTex).toBeGreaterThan(50);
    for (const p of paper.paragraphs) {
      // Every placeholder must have a matching TeX entry, and vice versa.
      const placeholders = p.html.match(/@@K(\d+)@@/g) ?? [];
      expect(placeholders).toHaveLength(p.mathTex.length);
    }
  });

  it("resolves citation links and leaves no internal bib anchors", () => {
    const paper = ig();
    expect(paper.paragraphs.some((p) => p.html.includes('#bib.'))).toBe(false);
    expect(
      paper.paragraphs.filter((p) => p.html.includes("<a ")).length,
    ).toBeGreaterThan(40);
    expect(
      paper.paragraphs.some(
        (p) =>
          p.html.includes('href="https://arxiv.org/abs/') ||
          p.html.includes('href="https://doi.org/'),
      ),
    ).toBe(true);
  });

  it("strips inline footnotes to superscript markers", () => {
    const paper = ig();
    const withRefs = paper.paragraphs.filter((p) =>
      p.html.includes("footnote-ref"),
    );
    expect(withRefs.length).toBeGreaterThan(0);
    // Footnote bodies are duplicated into paragraphs by arXiv; extraction
    // must not ship the marker plus the full note text inline.
    expect(paper.paragraphs.some((p) => p.html.includes('class="ltx_note'))).toBe(
      false,
    );
  });

  it("maps paragraphs to figures via regex (regression: 43 mapped)", () => {
    const paper = ig();
    const map = buildRegexFigureMap(paper.paragraphs, paper.figures);
    expect(Object.keys(map)).toHaveLength(43);
    const paraIds = new Set(paper.paragraphs.map((p) => p.id));
    const figureIds = new Set(paper.figures.map((f) => f.id));
    for (const [paraId, figIds] of Object.entries(map)) {
      expect(paraIds.has(paraId)).toBe(true);
      expect(figIds.length).toBeGreaterThan(0);
      for (const id of figIds) expect(figureIds.has(id)).toBe(true);
    }
  });
});

describe("extractPaper (Muse Glimmer fixture)", () => {
  it("extracts a math-heavy paper with footnotes and tables", () => {
    const paper = mg();
    expect(paper.title).toBe("Muse Glimmer 30B: An On-Device Agentic Model");
    expect(paper.authors).toEqual(["Muse Glimmer team"]);
    expect(paper.paragraphs).toHaveLength(162);
    expect(paper.figures).toHaveLength(14);
    expect(paper.figures.filter((f) => f.tableHtml)).toHaveLength(10);
    expect(
      Object.keys(buildRegexFigureMap(paper.paragraphs, paper.figures)),
    ).toHaveLength(11);

    const totalTex = paper.paragraphs.reduce(
      (n, p) => n + p.mathTex.length,
      0,
    );
    expect(totalTex).toBeGreaterThan(100);
    expect(
      paper.paragraphs.filter((p) => p.html.includes("footnote-ref")).length,
    ).toBeGreaterThan(0);
  });
});

describe("buildRegexFigureMap", () => {
  const para = (id: string, text: string): Paragraph => ({
    id,
    text,
    html: "",
    mathTex: [],
  });
  const fig = (
    id: string,
    number: number,
    kind: Figure["kind"] = "figure",
  ): Figure => ({
    id,
    label: `${kind === "table" ? "Table" : "Figure"} ${number}`,
    number,
    kind,
    caption: "",
    imageUrl: null,
  });

  const figures = [
    fig("f1", 1),
    fig("f2", 2),
    fig("f3", 3),
    fig("f4", 4),
    fig("f5", 5),
    fig("f6", 6),
    fig("t2", 2, "table"),
  ];

  it("links explicit Figure and Table citations by number and kind", () => {
    const map = buildRegexFigureMap(
      [
        para("p1", "As shown in Figure 3, accuracy improves."),
        para("p2", "Table 2 reports the results."),
        para("p3", "Figure 2 and Table 2 both matter."),
      ],
      figures,
    );
    expect(map.p1).toEqual(["f3"]);
    expect(map.p2).toEqual(["t2"]);
    // Figure 2 must resolve to the figure, not the table with the same number.
    expect(map.p3).toEqual(["f2", "t2"]);
  });

  it("expands ranges and abbreviations", () => {
    const map = buildRegexFigureMap(
      [
        para("p1", "Figures 4–6 illustrate scaling."),
        para("p2", "Fig. 1 shows the setup."),
      ],
      figures,
    );
    expect(map.p1).toEqual(["f4", "f5", "f6"]);
    expect(map.p2).toEqual(["f1"]);
  });

  it("omits paragraphs without references and unknown numbers", () => {
    const map = buildRegexFigureMap(
      [
        para("p1", "No references here."),
        para("p2", "Figure 99 does not exist."),
      ],
      figures,
    );
    expect(map).toEqual({});
  });
});

describe("toClientPayload", () => {
  it("strips paragraph text and keeps everything the client needs", () => {
    const paper = ig();
    const payload = toClientPayload(paper);
    expect(payload.paragraphs).toHaveLength(paper.paragraphs.length);
    expect(payload.title).toBe(paper.title);
    expect(payload.figures).toBe(paper.figures);
    expect(payload.paraFigureMap).toBe(paper.paraFigureMap);
    for (let i = 0; i < payload.paragraphs.length; i++) {
      const lean = payload.paragraphs[i];
      const full = paper.paragraphs[i];
      expect("text" in lean).toBe(false);
      expect(lean.id).toBe(full.id);
      expect(lean.html).toBe(full.html);
      expect(lean.mathTex).toBe(full.mathTex);
    }
  });
});
