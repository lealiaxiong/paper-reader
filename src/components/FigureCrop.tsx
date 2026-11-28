"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Props = {
  arxivId: string;
  pdfPage: number;
  bbox?: readonly [number, number, number, number];
  /** Accessible label for the rendered crop. */
  label: string;
  /** Lightbox rendering uses a higher scale. */
  detail?: boolean;
};

type RenderTask = { cancel: () => void };
type PdfJSLib = typeof import("pdfjs-dist");

/** One `getDocument` promise per paper so concurrent cards share a load. */
const docCache = new Map<string, Promise<PDFDocumentProxy>>();
let libPromise: Promise<PdfJSLib> | null = null;

/**
 * Lazy-load pdfjs-dist so deterministic readers (which never render crops)
 * don't pay for the bundle. The worker is same-origin via `worker-src`.
 */
function loadLib(): Promise<PdfJSLib> {
  if (libPromise) return libPromise;
  libPromise = import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return lib;
  });
  return libPromise;
}

function loadDocument(
  lib: PdfJSLib,
  arxivId: string,
): Promise<PDFDocumentProxy> {
  const cached = docCache.get(arxivId);
  if (cached) return cached;
  const task = lib.getDocument({
    url: `/api/pdf/arxiv/${encodeURIComponent(arxivId)}`,
    enableXfa: false,
  });
  const promise = task.promise;
  docCache.set(arxivId, promise);
  promise.catch(() => {
    if (docCache.get(arxivId) === promise) docCache.delete(arxivId);
  });
  return promise;
}

function isValidBbox(
  bbox: readonly [number, number, number, number] | undefined,
): bbox is readonly [number, number, number, number] {
  if (!bbox || bbox.length !== 4) return false;
  const [x, y, w, h] = bbox;
  return (
    [x, y, w, h].every(
      (value) => typeof value === "number" && value >= 0 && value <= 1,
    ) &&
    x + w <= 1 &&
    y + h <= 1 &&
    w > 0 &&
    h > 0
  );
}

export default function FigureCrop({
  arxivId,
  pdfPage,
  bbox,
  label,
  detail = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    const render = async () => {
      const display = canvasRef.current;
      if (!display) return;
      try {
        const lib = await loadLib();
        if (cancelled) return;
        const doc = await loadDocument(lib, arxivId);
        if (cancelled) return;
        const page = await doc.getPage(pdfPage);
        if (cancelled) return;

        const scale = detail ? 3 : 2;
        const viewport = page.getViewport({ scale });
        const offscreen = document.createElement("canvas");
        offscreen.width = Math.ceil(viewport.width);
        offscreen.height = Math.ceil(viewport.height);

        const task = page.render({ canvas: offscreen, viewport });
        renderTask = task;
        await task.promise;
        if (cancelled) return;

        const W = offscreen.width;
        const H = offscreen.height;
        let sx = 0;
        let sy = 0;
        let sw = W;
        let sh = H;
        if (isValidBbox(bbox)) {
          const [x, y, w, h] = bbox;
          sx = Math.floor(x * W);
          sy = Math.floor(y * H);
          sw = Math.min(W - sx, Math.ceil(w * W));
          sh = Math.min(H - sy, Math.ceil(h * H));
        }

        display.width = sw;
        display.height = sh;
        const displayContext = display.getContext("2d");
        if (!displayContext) throw new Error("no 2d context");
        displayContext.drawImage(offscreen, sx, sy, sw, sh, 0, 0, sw, sh);
        setReady(true);
        setFailed(false);
      } catch {
        if (!cancelled) {
          setReady(false);
          setFailed(true);
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // Ignore cancellation races.
      }
    };
    // Re-run when the page/bbox changes; the document itself is cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arxivId, pdfPage, bbox?.[0], bbox?.[1], bbox?.[2], bbox?.[3], detail]);

  if (failed) {
    return (
      <div className="flex h-24 items-center justify-center rounded bg-media font-sans text-xs text-media-foreground/70">
        No image available
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      role="img"
      className={
        ready
          ? detail
            ? "mx-auto max-h-[68vh] w-auto max-w-full"
            : "max-h-72 w-full object-contain dark:brightness-[0.94]"
          : "h-24 w-full animate-pulse rounded bg-media"
      }
    />
  );
}
