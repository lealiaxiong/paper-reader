"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderPayload, Figure } from "@/lib/types";
import FigureCard from "./FigureCard";

type Props = {
  data: ReaderPayload;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Mobile-only (<lg) persistent figure drawer: an always-mounted fixed bar
 * so focus changes never reflow the reading column. Shows the figure(s)
 * cited by the focused paragraph, or a browse entry when none is.
 *
 * When a paragraph is in focus, the strip shows only the referenced
 * figures/tables — a "Show all n" toggle switches to browsing everything.
 * The current figure is scrolled into view on paragraph change, cycling,
 * or open — instantly, and never in response to the user scrolling.
 * The toggle state resets when the focused paragraph changes.
 *
 * Paragraphs referencing multiple figures get a carousel (‹ i/n ›) in the
 * bar to cycle just the referenced ones, mirroring the desktop sidebar.
 */
export default function FigureSlot({ data, activeParaId, activeFigureIds }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [index, setIndex] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Paragraph-scoped carousel (like the desktop sidebar): resets to the
  // first referenced figure when the focused paragraph changes.
  const [carousel, setCarousel] = useState<{ paraId: string | null; index: number }>({
    paraId: activeParaId,
    index: 0,
  });

  // "Show all" override, scoped to this paragraph: changing focus reverts to
  // the filtered view automatically.
  const [showAllFor, setShowAllFor] = useState<string | null>(null);

  const focused = [...activeFigureIds]
    .map((id) => data.figures.find((f) => f.id === id))
    .filter((f): f is Figure => !!f);
  const total = focused.length;
  const carouselIndex = carousel.paraId === activeParaId ? carousel.index : 0;
  const clamped = total > 0 ? Math.min(carouselIndex, total - 1) : 0;
  const current = total > 0 ? focused[clamped] : null;
  const setCarouselIndex = (next: number) =>
    setCarousel({ paraId: activeParaId, index: Math.max(0, Math.min(total - 1, next)) });

  const showAll = !!current && showAllFor === activeParaId;
  const visible = showAll || !current ? data.figures : focused;

  // Measure which card is snapped in view, for the "n / total" counter.
  // When the strip shows only the referenced cards, swiping it also drives
  // the carousel, so the bar and arrows stay in sync with the swipe.
  const filtered = !!current && !showAll;
  const measure = useCallback(() => {
    const strip = sheetRef.current;
    const first = strip?.firstElementChild as HTMLElement | null;
    if (!strip || !first) return;
    const gap = parseFloat(getComputedStyle(strip).columnGap || "0");
    const step = first.offsetWidth + gap;
    if (step <= 0) return;
    const i = Math.round(strip.scrollLeft / step);
    setIndex(i);
    if (filtered) {
      const clampedI = Math.max(0, Math.min(focused.length - 1, i));
      setCarousel((c) =>
        c.paraId === activeParaId && c.index === clampedI
          ? c
          : { paraId: activeParaId, index: clampedI },
      );
    }
  }, [filtered, focused.length, activeParaId]);

  // Position the strip on the focused figure. Called on paragraph change
  // and when the drawer is opened — deliberately not on strip scroll.
  const scrollToFocused = useCallback(() => {
    const strip = sheetRef.current;
    if (!strip || !current) return;
    const el = strip.querySelector<HTMLElement>(`#fig-${CSS.escape(current.id)}`);
    if (!el) return;
    strip.scrollTo({
      left: el.getBoundingClientRect().left - strip.getBoundingClientRect().left
        + strip.scrollLeft - (strip.clientWidth - el.clientWidth) / 2,
      // Instant jump — smooth scrolling flies past every figure in between.
      behavior: "auto",
    });
  }, [current]);

  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measure();
    });
  };

  useEffect(() => {
    if (!expanded) return;
    scrollToFocused();
    // The strip's cards change on toggle and it remounts on every open, so
    // sample the position once after mount/toggle.
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [activeParaId, expanded, showAll, scrollToFocused, measure]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (data.figures.length === 0) return null;

  const label = current
    ? `${current.label}${total > 1 ? ` · ${clamped + 1}/${total}` : ""}`
    : `Figures & tables (${data.figures.length})`;
  const summary = current
    ? current.caption || "Figure cited by this paragraph"
    : "Browse all figures and tables";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      role="region"
      aria-label="Figures and tables"
    >
      {expanded && (
        <div className="border-b border-zinc-100">
          <div className="flex items-center justify-between gap-3 px-4 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {current && !showAll ? "Cited by this paragraph" : "All figures & tables"}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium tabular-nums text-zinc-500" aria-hidden="true">
                {current && !showAll
                  ? `${clamped + 1} / ${total}`
                  : `${index + 1} / ${data.figures.length}`}
              </span>
              {current && (
                <button
                  type="button"
                  onClick={() => setShowAllFor(showAll ? null : activeParaId)}
                  className="text-xs font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                >
                  {showAll ? `Only cited (${total})` : `Show all ${data.figures.length}`}
                </button>
              )}
            </div>
          </div>
          <div
            ref={sheetRef}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain px-[7vw] pb-3 pt-1"
          >
            {visible.map((f) => (
              <div key={f.id} className="w-[86vw] max-w-[430px] shrink-0 snap-center">
                <FigureCard figure={f} active={activeFigureIds.has(f.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex h-12 items-stretch">
        {total > 1 && (
          <button
            type="button"
            onClick={() => setCarouselIndex(clamped - 1)}
            disabled={clamped === 0}
            aria-label="Previous figure cited by this paragraph"
            className="w-11 shrink-0 text-lg text-violet-700 disabled:opacity-30"
          >
            ‹
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 px-2 text-left"
        >
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-violet-700">
            {label}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
            {summary}
          </span>
          <span className="shrink-0 text-zinc-500" aria-hidden="true">
            {expanded ? "▾" : "▴"}
          </span>
        </button>
        {total > 1 && (
          <button
            type="button"
            onClick={() => setCarouselIndex(clamped + 1)}
            disabled={clamped === total - 1}
            aria-label="Next figure cited by this paragraph"
            className="w-11 shrink-0 text-lg text-violet-700 disabled:opacity-30"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
