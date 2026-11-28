"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Figure } from "@/lib/types";
import FigureCrop from "./FigureCrop";
import FigureExplanation, { MUSE_EMBER_NOTE } from "./FigureExplanation";

type Props = {
  figure: Figure | null;
  /** Source paper id, used to stream the PDF for BYOM crops. */
  arxivId: string;
  onClose: () => void;
};

/**
 * Full-screen lightbox: click backdrop or press Escape to close.
 * Renders the same image (or table HTML) as the sidebar card, but at natural size.
 *
 * Rendered via createPortal to document.body at z-100 so it always sits
 * above the sticky header (z-30) — a modal must cover the whole page,
 * including the URL bar. This is the standard pattern (shadcn/Radix use
 * portals for the same reason: stacking contexts can otherwise trap the
 * overlay under ancestors).
 */
import { createPortal } from "react-dom";
export default function FigureLightbox({ figure, arxivId, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    if (figure) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [figure, handleKey]);

  if (!figure) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-4 backdrop-blur-sm dark:bg-black/80 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={figure.label}
    >
      <div
        className="relative max-h-full w-full max-w-5xl overflow-auto rounded-xl border border-border bg-surface-raised p-4 text-foreground shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-button text-button-foreground shadow-sm transition-opacity hover:opacity-85"
          aria-label="Close"
        >
          ✕
        </button>
        <h3 className="mb-4 pr-12 font-sans text-xs font-semibold text-muted">
          {figure.label}
        </h3>
        {figure.imageUrl ? (
          // <img> for both PNG and SVG (object swallows clicks / rendering differs)
          <div className="rounded-lg border border-media-border bg-media p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={figure.imageUrl}
              alt={figure.caption || figure.label}
              className="mx-auto max-h-[68vh] w-auto max-w-full dark:brightness-[0.94]"
            />
          </div>
        ) : figure.tableHtml ? (
          <div
            className="max-h-[68vh] overflow-auto rounded-lg border border-media-border bg-media p-3 font-reading text-sm leading-6 text-media-foreground [&_table]:border-collapse [&_th]:border-b [&_th]:border-media-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_td]:border-b [&_td]:border-media-border/70 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_td]:break-words [&_td]:tabular-nums [&_tr:nth-child(even)]:bg-black/[0.035]"
            dangerouslySetInnerHTML={{ __html: figure.tableHtml }}
          />
        ) : figure.pdfPage ? (
          <div className="rounded-lg border border-media-border bg-media p-3">
            <FigureCrop
              arxivId={arxivId}
              pdfPage={figure.pdfPage}
              bbox={figure.bbox}
              label={figure.caption || figure.label}
              detail
            />
          </div>
        ) : (
          <p className="font-sans text-sm text-subtle">No image available</p>
        )}
        {figure.caption && (
          <p className="mx-auto mt-4 w-full font-reading text-sm leading-6 text-muted">
            {figure.caption}
          </p>
        )}
        {figure.explanation && (
          <>
            <FigureExplanation
              explanation={figure.explanation}
              size="lightbox"
              className="mx-auto mt-3 w-full"
            />
            <p className="mx-auto mt-2 w-full font-sans text-[11px] leading-tight text-subtle">
              {MUSE_EMBER_NOTE}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
