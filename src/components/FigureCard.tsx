"use client";

import { useState } from "react";
import type { Figure } from "@/lib/types";
import FigureCrop from "./FigureCrop";
import FigureLightbox from "./FigureLightbox";
import FigureExplanation from "./FigureExplanation";

type Props = {
  figure: Figure;
  /** Source paper id, used to stream the PDF for BYOM crops. */
  arxivId: string;
  /** True when this figure is linked from the currently visible paragraph */
  active: boolean;
  /** Carousel position info — only set on the carousel's active card */
  carousel?: {
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
};

export default function FigureCard({ figure, active, arxivId, carousel }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const clickable = !!figure.imageUrl || !!figure.tableHtml || !!figure.pdfPage;

  const body = figure.imageUrl ? (
    // Use <img> for both PNG and SVG — <object> swallows click events so it
    // breaks the lightbox. Browsers render SVG in <img> fine.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={figure.imageUrl}
      alt={figure.caption || figure.label}
      className={`max-h-72 w-full object-contain dark:brightness-[0.94] ${clickable ? "pointer-events-none" : ""}`}
      loading="lazy"
    />
  ) : figure.tableHtml ? (
    <div className="max-h-72 overflow-auto font-reading text-[13px] leading-5 text-media-foreground [&_table]:border-collapse [&_th]:border-b [&_th]:border-media-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_td]:border-b [&_td]:border-media-border/70 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_td]:break-words [&_td]:tabular-nums [&_tr:nth-child(even)]:bg-black/[0.035]">
      <div dangerouslySetInnerHTML={{ __html: figure.tableHtml }} />
    </div>
  ) : figure.pdfPage ? (
    <FigureCrop
      arxivId={arxivId}
      pdfPage={figure.pdfPage}
      bbox={figure.bbox}
      label={figure.caption || figure.label}
    />
  ) : (
    <div className="flex h-24 items-center justify-center rounded bg-media font-sans text-xs text-media-foreground/70">
      No image available
    </div>
  );

  const openLightbox = () => setLightboxOpen(true);

  return (
    <>
      <figure
        id={`fig-${figure.id}`}
        className={`rounded-xl border bg-surface-raised p-3 transition-colors ${
          active
            ? "border-accent-border ring-1 ring-accent-border/30"
            : "border-border"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <figcaption
            className={`font-sans text-xs font-semibold ${
              active ? "text-accent-strong" : "text-muted"
            }`}
          >
            {figure.label}
          </figcaption>
          {clickable && (
            <span
              className="font-sans text-xs text-subtle"
              title="Click to expand"
              aria-hidden="true"
            >
              ⤢
            </span>
          )}
        </div>
        {clickable ? (
          <div
            onClick={openLightbox}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openLightbox();
              }
            }}
            className="cursor-zoom-in rounded-lg border border-media-border bg-media p-2 transition-opacity hover:opacity-95"
            aria-label={`Expand ${figure.label}`}
          >
            {body}
          </div>
        ) : (
          <div className="rounded-lg border border-media-border bg-media p-2">
            {body}
          </div>
        )}
        {figure.caption && (
          <p className="mt-2.5 font-reading text-[13px] leading-[1.55] text-muted">
            {figure.caption}
          </p>
        )}
        {carousel && carousel.total > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-3 border-t border-border pt-2.5">
            <button
              onClick={carousel.onPrev}
              className="grid h-8 w-8 place-items-center rounded-md border border-border font-sans text-base text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
              disabled={carousel.index === 0}
              aria-label="Previous figure"
            >
              ‹
            </button>
            <span className="font-sans text-xs font-medium tabular-nums text-subtle">
              {carousel.index + 1} / {carousel.total}
            </span>
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: carousel.total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === carousel.index ? "bg-accent" : "bg-border-strong"
                  }`}
                />
              ))}
            </span>
            <button
              onClick={carousel.onNext}
              className="grid h-8 w-8 place-items-center rounded-md border border-border font-sans text-base text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
              disabled={carousel.index === carousel.total - 1}
              aria-label="Next figure"
            >
              ›
            </button>
          </div>
        )}
        {figure.explanation && (
          <FigureExplanation
            explanation={figure.explanation}
            className="mt-2.5"
          />
        )}
      </figure>
      {lightboxOpen && (
        <FigureLightbox
          figure={figure}
          arxivId={arxivId}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
