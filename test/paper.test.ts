import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  buildRegexFigureMap,
  extractPaper,
  fetchPaperHtml,
  toClientPayload,
} from "@/lib/paper";
import {
  extractArxivId,
  parseSourceId,
  parseSourceInput,
  parseSourceRoute,
  sourcePath,
} from "@/lib/sources";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const ar5ivHtml = `<!doctype html><html><head>
<title>[0704.0028] Pfaffians, hafnians and products of real linear functionals</title>
</head><body><article class="ltx_document">
<p class="ltx_p">The identity <math alttext="x^2"><annotation encoding="application/x-tex">x^2</annotation></math> holds.</p>
<figure><figcaption>Figure 1: A relative image.</figcaption><img src="/html/0704.0028/assets/f1.png"></figure>
</article></body></html>`;

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

let attention: ReaderData | undefined;
function attentionPaper(): ReaderData {
  // 1706.03762v7 — Attention Is All You Need. Featured example on the landing
  // page; author names contain nested footnote marks that must not leak.
  return (attention ??= extractPaper(
    loadFixture("1706.03762v7.html.gz"),
    "1706.03762",
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

describe("source references", () => {
  it("normalizes URLs and bare IDs to a canonical source ref", () => {
    const ref = parseSourceInput("https://arxiv.org/html/2401.12345v2");
    expect(ref).toEqual({ source: "arxiv", id: "2401.12345" });
    expect(sourcePath(ref!)).toBe("/read/arxiv/2401.12345");
  });

  it("parses canonical route segments", () => {
    expect(parseSourceRoute("arxiv", ["2401.12345"])).toEqual({
      source: "arxiv",
      id: "2401.12345",
    });
    expect(parseSourceRoute("arxiv", ["2401.12345", "extra"])).toBeNull();
    expect(parseSourceRoute("unknown", ["2401.12345"])).toBeNull();
    expect(parseSourceRoute("arxiv", [])).toBeNull();
  });

  it("validates API source/id pairs", () => {
    expect(parseSourceId("arxiv", " 2401.12345v3 ")).toEqual({
      source: "arxiv",
      id: "2401.12345",
    });
    expect(parseSourceId("arxiv", "https://arxiv.org/abs/2401.12345")).toBeNull();
    expect(parseSourceId("unknown", "2401.12345")).toBeNull();
  });
});

describe("fetchPaperHtml", () => {
  it("uses arXiv HTML when available and never requests ar5iv", async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(ar5ivHtml));
    vi.stubGlobal("fetch", fetchMock);

    const paper = await fetchPaperHtml("0704.0028");

    expect(paper.provider).toBe("arxiv-html");
    expect(paper.baseUrl).toBe("https://arxiv.org/html/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to ar5iv when arXiv has no HTML", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(htmlResponse(ar5ivHtml));
    vi.stubGlobal("fetch", fetchMock);

    const fetched = await fetchPaperHtml("0704.0028");
    expect(fetched.provider).toBe("ar5iv");
    expect(fetched.baseUrl).toBe("https://ar5iv.arxiv.org/html/");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const paper = extractPaper(fetched.html, "0704.0028", fetched.baseUrl);
    expect(paper.title).toBe(
      "Pfaffians, hafnians and products of real linear functionals",
    );
    expect(paper.paragraphs[0].mathTex).toEqual(["x^2"]);
    expect(paper.figures[0].imageUrl).toBe(
      "https://ar5iv.arxiv.org/html/0704.0028/assets/f1.png",
    );
  });

  it("rejects ar5iv redirects to an abstract page with no paper content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        htmlResponse("<html><head><title>No content available</title></head></html>"),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPaperHtml("0704.0028")).rejects.toThrow(
      /No HTML version available for arXiv:0704\.0028/,
    );
  });

  it("does not try providers for an invalid arXiv ID", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPaperHtml("hep-th/9901001")).rejects.toThrow(
      "Invalid arXiv ID",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractPaper (InstructGPT fixture)", () => {
  it("extracts title, authors, and paragraph count", () => {
    const paper = ig();
    expect(paper.source).toBe("arxiv");
    expect(paper.sourceId).toBe("2203.02155");
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

describe("HTML sanitization (XSS regression)", () => {
  function tinyPaper(body: string): string {
    return `<!doctype html><html><head><title>Untrusted Paper - arXiv</title></head><body>${body}</body></html>`;
  }

  it("does not re-parse escaped link text as markup", () => {
    const paper = extractPaper(
      tinyPaper(
        `<p>Before text <a href="#A1">&lt;img src=x onerror="alert(1)"&gt;</a> after text.</p>`,
      ),
      "2401.00001",
    );
    const html = paper.paragraphs[0].html;
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;img");
  });

  it("drops javascript:/data: hrefs but keeps the link text", () => {
    const paper = extractPaper(
      tinyPaper(
        `<p>See <a href="javascript:alert(1)">this citation</a> and ` +
          `<a href="data:text/html;base64,PHNjcmlwdD4=">that one</a> for details.</p>`,
      ),
      "2401.00002",
    );
    const html = paper.paragraphs[0].html;
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/data:/i);
    expect(html).toContain("this citation");
    expect(html).toContain("that one");
  });

  it("keeps safe external links while stripping event handlers", () => {
    const paper = extractPaper(
      tinyPaper(
        `<p>Read <a href="https://example.com/paper" onclick="alert(1)" title="t">the source</a> online.</p>`,
      ),
      "2401.00003",
    );
    const html = paper.paragraphs[0].html;
    expect(html).toContain('href="https://example.com/paper"');
    expect(html).not.toMatch(/onclick/i);
  });

  it("escapes footnote marks instead of interpolating them", () => {
    const paper = extractPaper(
      tinyPaper(
        `<p>Statement text<span class="ltx_note" role="doc-footnote">` +
          `<span class="ltx_note_mark">&lt;b&gt;boom&lt;/b&gt;</span>` +
          `<span class="ltx_note_body">Note body.</span></span> continues afterward.</p>`,
      ),
      "2401.00004",
    );
    const html = paper.paragraphs[0].html;
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain("&lt;b&gt;boom");
    expect(html).not.toMatch(/<b>boom/);
  });

  it("sanitizes table HTML: no scripts/handlers, layout preserved", () => {
    const paper = extractPaper(
      tinyPaper(
        `<figure id="S1.T1"><figcaption>Table 1: Injected attributes.</figcaption>` +
          `<table><tr><td colspan="2" onclick="alert(1)" style="padding-left:4pt;position:fixed;font-size:80%" onmouseover="alert(2)">` +
          `<script>alert(3)</script><svg onload="alert(4)"></svg>` +
          `<a href="javascript:alert(5)">bad link</a> text</td></tr></table></figure>`,
      ),
      "2401.00005",
    );
    const table = paper.figures[0];
    expect(table.kind).toBe("table");
    const html = table.tableHtml ?? "";
    expect(html).toMatch(/^<table/);
    expect(html).not.toMatch(/on(click|mouseover|error|load)/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<(img|svg|script|iframe)/i);
    expect(html).toContain('colspan="2"');
    expect(html).toContain("padding-left:4pt");
    expect(html).toContain("font-size:80%");
    expect(html).not.toContain("position");
  });

  it("strips script/img/style injection from paragraph HTML", () => {
    const paper = extractPaper(
      tinyPaper(
        `<p>Plain text <script>alert(1)</script><img src=x onerror=alert(2)>` +
          `<span style="position:fixed;inset:0">overlay text</span> end.</p>`,
      ),
      "2401.00006",
    );
    const html = paper.paragraphs[0].html;
    expect(html).not.toMatch(/alert\(1\)/);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/position/i);
    expect(html).not.toMatch(/<script|<img/i);
    expect(html).toContain("overlay text");
  });
});

describe("extractPaper (Attention fixture)", () => {
  it("strips nested footnote marks from author names", () => {
    const paper = attentionPaper();
    expect(paper.title).toBe("Attention Is All You Need");
    expect(paper.authors).toEqual([
      "Ashish Vaswani",
      "Noam Shazeer",
      "Niki Parmar",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N. Gomez",
      "Łukasz Kaiser",
      "Illia Polosukhin",
    ]);
    for (const author of paper.authors) {
      expect(author).not.toMatch(/footnote|mark:/i);
    }
  });

  it("extracts paragraphs, figures, and tables", () => {
    const paper = attentionPaper();
    expect(paper.paragraphs).toHaveLength(65);
    expect(paper.figures).toHaveLength(9);
    expect(paper.figures.filter((f) => f.imageUrl)).toHaveLength(5);
    expect(paper.figures.filter((f) => f.tableHtml)).toHaveLength(4);
    expect(
      Object.keys(buildRegexFigureMap(paper.paragraphs, paper.figures)),
    ).toHaveLength(13);
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
