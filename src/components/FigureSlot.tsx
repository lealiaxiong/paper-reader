"use client";

import { useState } from "react";
import type { ReaderPayload, Figure } from "@/lib/types";
import FigureCard from "./FigureCard";

type Props = {
  data: ReaderPayload;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Mobile-only (<lg) persistent figure slot: a fixed bar that is always
 * mounted, so focus changes never shift the reading column. Shows the
 * figure(s) cited by the focused paragraph; tap to expand the card inline
 * (carousel included) or to open the lightbox from it. Fixed positioning
 * keeps it out of flow — no layout shift either way.
 */
export default function FigureSlot({ data, activeParaId, activeFigureIds }: Props) {
  const [expanded, setExpanded] = useState(false);
  // Carousel index, reset when the focused paragraph changes.
  const [carousel, setCarousel] = useState<{ paraId: string | null; index: number }>({
    paraId: activeParaId,
    index: 0,
  });

  const activeFigures = [...activeFigureIds]
    .map((id) => data.figures.find((f) => f.id === id))
    .filter((f): f is Figure => !!f);
  const total = activeFigures.length;

  const carouselIndex = carousel.paraId === activeParaId ? carousel.index : 0;
  const clamped = total > 0 ? Math.min(carouselIndex, total - 1) : 0;
  const current = total > 0 ? activeFigures[clamped] : null;

  const setIndex = (next: number | ((i: number) => number)) =>
    setCarousel((c) => {
      const base = c.paraId === activeParaId ? c.index : 0;
      return {
        paraId: activeParaId,
        index: typeof next === "function" ? next(base) : next,
      };
    });

  if (data.figures.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      role="region"
      aria-label="Figure cited by the focused paragraph"
    >
      {expanded && current && (
        <div className="max-h-[65vh] overflow-y-auto border-b border-zinc-100 p-3">
          <FigureCard
            figure={current}
            active
            carousel={
              total > 1
                ? {
                    index: clamped,
                    total,
                    onPrev: () => setIndex((i) => Math.max(0, i - 1)),
                    onNext: () => setIndex((i) => Math.min(total - 1, i + 1)),
                  }
                : undefined
            }
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => current && setExpanded((v) => !v)}
        disabled={!current}
        aria-expanded={expanded}
        className="flex h-12 w-full items-center gap-3 px-4 text-left disabled:cursor-default"
      >
        {current ? (
          <>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-violet-700">
              {current.label}
              {total > 1 && (
                <span className="text-zinc-400"> · {clamped + 1}/{total}</span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
              {current.caption || "Figure"}
            </span>
            <span className="shrink-0 text-zinc-500" aria-hidden="true">
              {expanded ? "▾" : "▴"}
            </span>
          </>
        ) : (
          <span className="flex-1 truncate text-xs text-zinc-400">
            Scroll to a paragraph that cites a figure
          </span>
        )}
      </button>
    </div>
  );
}
