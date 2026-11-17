"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { ReaderPayload } from "@/lib/types";

type Props = {
  data: ReaderPayload;
  activeParaId: string | null;
  onActiveParaChange: (id: string | null) => void;
};

/**
 * Main reading column, fixed 650px width. It is centered on its own below
 * xl, and paired with the figure rail in a centered group at xl and up.
 * An IntersectionObserver reports which paragraph is centered in the
 * viewport — that drives the sidebar highlight.
 * Math placeholders (@@Kn@@) are rendered with KaTeX after mount.
 */
export default function ReaderBody({ data, activeParaId, onActiveParaChange }: Props) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Deterministic active-paragraph detection: on every scroll tick (via
    // rAF), pick the paragraph whose vertical center is closest to the
    // viewport center. Same scroll position always yields the same answer,
    // regardless of scroll direction or observer entry history.
    let current: string | null = null;
    let raf = 0;
    let ticking = false;

    const update = () => {
      ticking = false;
      const paras = root.querySelectorAll<HTMLElement>("[data-para-id]");
      if (paras.length === 0) return;

      const viewportCenter = window.innerHeight / 2;
      let bestId: string | null = null;
      let bestDist = Infinity;

      for (const el of paras) {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.getAttribute("data-para-id");
        }
      }

      if (bestId && bestId !== current) {
        current = bestId;
        onActiveParaChange(bestId);
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update(); // initial position (top of paper)

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [data, onActiveParaChange]);

  // Render KaTeX math after paragraphs are in the DOM.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    // Build a lookup: paraId -> mathTex[] (in order)
    const mathByPara: Record<string, string[]> = {};
    for (const p of data.paragraphs) mathByPara[p.id] = p.mathTex;
    root.querySelectorAll("[data-para-id]").forEach((paraEl) => {
      const paraId = paraEl.getAttribute("data-para-id") || "";
      const texList = mathByPara[paraId] || [];
      paraEl.querySelectorAll("[data-katex-index]").forEach((el) => {
        const idx = parseInt(el.getAttribute("data-katex-index") || "0", 10);
        const tex = texList[idx] || "";
        try {
          katex.render(tex, el as HTMLElement, { throwOnError: false });
        } catch {
          (el as HTMLElement).textContent = tex;
        }
      });
    });
  }, [data]);

  const linkedParaIds = new Set(Object.keys(data.paraFigureMap));

  // Split a paragraph's HTML into text and math segments for rendering.
  const renderParagraphHtml = (html: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /@@K(\d+)@@/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = regex.exec(html)) !== null) {
      if (m.index > lastIndex) {
        parts.push(
          <span
            key={key++}
            dangerouslySetInnerHTML={{ __html: html.slice(lastIndex, m.index) }}
          />,
        );
      }
      // Math placeholder — value filled by KaTeX effect.
      parts.push(
        <span key={key++} data-katex-index={m[1]} />,
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < html.length) {
      parts.push(
        <span
          key={key++}
          dangerouslySetInnerHTML={{ __html: html.slice(lastIndex) }}
        />,
      );
    }
    return parts;
  };

  return (
    <article
      ref={containerRef}
      id="paper"
      tabIndex={-1}
      className="mx-auto w-full max-w-[650px] shrink-0 scroll-mt-24 px-4 py-8 font-reading xl:py-10"
      aria-label="Paper"
    >
      <h1 className="mb-3 text-balance text-[1.9rem] font-semibold leading-[1.25] tracking-tight text-foreground sm:text-[2rem]">
        {data.title}
      </h1>
      {data.authors.length > 0 && (
        <p className="mb-3 text-[15px] leading-6 text-muted">
          {data.authors.join(", ")}
        </p>
      )}
      <p className="mb-8 font-sans text-[13px] text-subtle">
        <a
          href={`https://arxiv.org/abs/${data.arxivId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-strong"
          title="View on arXiv"
        >
          arXiv:{data.arxivId}
        </a>
      </p>

      {data.paragraphs.map((p) => {
        const isActive = p.id === activeParaId;
        const isLinked = linkedParaIds.has(p.id);
        return (
          <p
            key={p.id}
            id={`para-${p.id}`}
            data-para-id={p.id}
            data-active={isActive ? "true" : "false"}
            className={`mb-5 scroll-mt-24 rounded-md border-l-[3px] py-1 pl-3 pr-3 text-[18px] leading-[1.7] text-foreground transition-colors [&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 [&_a]:underline-offset-2 [&_a]:break-words [&_a:hover]:text-accent-strong [&_.footnote-ref]:align-super [&_.footnote-ref]:text-[0.72em] [&_.footnote-ref]:text-subtle [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2 ${
              isActive && isLinked
                ? "border-accent bg-accent-soft"
                : isLinked
                  ? "border-accent-border/60"
                  : "border-transparent"
            }`}
          >
            {renderParagraphHtml(p.html)}
          </p>
        );
      })}
    </article>
  );
}
