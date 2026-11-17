"use client";

import { useEffect, useRef, useState } from "react";
import type { ReaderPayload } from "@/lib/types";
import FigureCard from "./FigureCard";
import { MUSE_EMBER_NOTE } from "./FigureExplanation";

type Props = {
  data: ReaderPayload;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Desktop (xl+) margin figures: sticky 360px sidebar with its own scroll,
 * hidden below 1280px where FigureSlot provides figure access. List is in
 * natural order, and on window scroll the inner list is scrolled so the
 * active figure appears at the same viewport Y as the active paragraph.
 *
 * Multi-figure paragraphs get a carousel: the active slot shows one figure
 * at a time with prev/next nav and dots. When the paragraph changes, the
 * carousel resets to index 0. While scrolling within the same paragraph,
 * the chosen index is preserved (no auto-advance).
 */
export default function FigureSidebar({ data, activeParaId, activeFigureIds }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Carousel state: index within the active paragraph's figure list, together
  // with the paragraph it belongs to. Changing paragraphs derives index 0 on
  // the next render — no effect/reset pass needed.
  const [carousel, setCarousel] = useState<{
    paraId: string | null;
    index: number;
  }>({ paraId: activeParaId, index: 0 });

  const carouselIndex = carousel.paraId === activeParaId ? carousel.index : 0;

  const setCarouselIndex = (next: number | ((index: number) => number)) => {
    setCarousel((c) => {
      const base = c.paraId === activeParaId ? c.index : 0;
      return {
        paraId: activeParaId,
        index: typeof next === "function" ? next(base) : next,
      };
    });
  };

  // Ordered list of figures cited by the active paragraph (in reading order,
  // as returned by the regex map). Empty when the paragraph cites nothing.
  const activeFigures = [...activeFigureIds]
    .map((id) => data.figures.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f);
  const carouselTotal = activeFigures.length;
  const clampedIndex = carouselIndex >= carouselTotal ? carouselTotal - 1 : carouselIndex;
  const currentCarouselFigure = carouselTotal > 0 ? activeFigures[clampedIndex] : null;

  const onPrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const onNext = () => setCarouselIndex((i) => Math.min(carouselTotal - 1, i + 1));

  useEffect(() => {
    // Scroll-sync only makes sense in the desktop side-by-side layout;
    // below 1280px the sidebar is hidden and FigureSlot is used. Checked
    // on every tick so resizing across the breakpoint behaves too.
    const mq = window.matchMedia("(min-width: 1280px)");

    const sync = () => {
      if (!mq.matches) return;
      const container = scrollRef.current;
      if (!container) return;

      const activePara = document.querySelector<HTMLElement>(
        "[data-para-id][data-active='true']",
      );
      if (!activePara) return;

      // Align the currently shown carousel figure (or first active figure).
      const targetId = currentCarouselFigure?.id ?? [...activeFigureIds][0];
      if (!targetId) return;
      const figEl = document.getElementById(`fig-${targetId}`);
      if (!figEl) return;

      const paraTop = activePara.getBoundingClientRect().top;
      const figTop = figEl.getBoundingClientRect().top;
      container.scrollTop += figTop - paraTop;
      container.scrollTop = Math.max(
        0,
        Math.min(container.scrollTop, container.scrollHeight - container.clientHeight),
      );
    };

    let raf = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        sync();
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    sync();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [activeParaId, activeFigureIds, currentCarouselFigure]);

  const hasExplanations = data.figures.some((figure) => !!figure.explanation);

  if (data.figures.length === 0) {
    return (
      <aside className="hidden w-full xl:block">
        <p className="text-sm leading-relaxed text-subtle">
          No figures detected in this paper.
        </p>
      </aside>
    );
  }

  return (
    <aside className="hidden w-full xl:block">
      <div className="sticky top-[calc(var(--header-height)+1rem)] flex max-h-[calc(100dvh-var(--header-height)-2rem)] flex-col">
        <div className="pb-2">
          <h2 className="font-sans text-xs font-semibold text-muted">Figures</h2>
          {hasExplanations && (
            <p className="mt-1 font-sans text-[11px] leading-tight text-subtle">
              {MUSE_EMBER_NOTE}
            </p>
          )}
        </div>
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pr-1"
        >
          {/* Natural order — no reordering. The scroll-sync above places the
              active figure next to its paragraph. The carousel figure carries
              the prev/next nav; other linked figures keep natural position. */}
          {data.figures.map((f) => (
            <FigureCard
              key={f.id}
              figure={f}
              active={activeFigureIds.has(f.id)}
              carousel={
                currentCarouselFigure?.id === f.id && carouselTotal > 1
                  ? {
                      index: clampedIndex,
                      total: carouselTotal,
                      onPrev,
                      onNext,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
