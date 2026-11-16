"use client";

import { useEffect, useRef, useState } from "react";
import type { ReaderPayload } from "@/lib/types";
import FigureCard from "./FigureCard";

type Props = {
  data: ReaderPayload;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Margin figures: sticky sidebar with its own scroll. The list is in natural
 * figure order, and on window scroll the inner list is scrolled so the active
 * figure appears at the same viewport Y as the active paragraph.
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
    // on mobile the sidebar stacks below the article. Checked on every
    // tick so rotating/resizing across the breakpoint behaves too.
    const mq = window.matchMedia("(min-width: 1024px)");

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

  if (data.figures.length === 0) {
    return (
      <aside className="w-full border-t border-zinc-200 p-4 text-sm text-zinc-500 lg:w-80 lg:shrink-0 lg:border-t-0">
        No figures detected in this paper.
      </aside>
    );
  }

  return (
    <aside className="w-full border-t border-zinc-200 p-4 lg:w-80 lg:shrink-0 lg:border-t-0">
      <div className="flex flex-col lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)]">
        <h2 className="pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Figures
        </h2>
        <div
          ref={scrollRef}
          className="flex flex-col gap-4 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
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
