"use client";

import React, { useCallback, useState } from "react";
import type { ReaderPayload } from "@/lib/types";
import BrandButton from "@/components/Brand";
import ReaderToolbar from "@/components/ReaderToolbar";
import UrlBar from "@/components/UrlBar";
import ReaderBody from "@/components/ReaderBody";
import FigureSidebar from "@/components/FigureSidebar";
import FigureSlot from "@/components/FigureSlot";
import Landing from "@/components/Landing";
import ThemeToggle from "@/components/ThemeToggle";
import { useDropTarget } from "@/components/dropTarget";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReaderPayload | null>(null);
  const [activeParaId, setActiveParaId] = useState<string | null>(null);

  const load = useCallback(async (input?: string) => {
    const target = (input ?? url).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setData(null); // clear the previous paper while the new one loads
    setActiveParaId(null);
    window.scrollTo(0, 0);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setData(null);
        return;
      }
      const next: ReaderPayload = json.data;
      setData(next);
      setActiveParaId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const loadExample = useCallback(
    (exampleUrl: string) => {
      setUrl(exampleUrl);
      void load(exampleUrl);
    },
    [load],
  );

  const goHome = useCallback(() => {
    setData(null);
    setUrl("");
    setError(null);
    setActiveParaId(null);
    window.scrollTo(0, 0);
  }, []);

  const handleDrop = useCallback(
    (text: string) => {
      const first = text.trim().split(/\s+/)[0];
      if (!first) return;
      setUrl(first);
      void load(first);
    },
    [load],
  );

  const { hovering } = useDropTarget(handleDrop);

  const activeFigureIds = React.useMemo(
    () => new Set<string>(activeParaId ? (data?.paraFigureMap[activeParaId] ?? []) : []),
    [activeParaId, data],
  );

  return (
    <div className="min-h-full">
      {data && (
        <a
          href="#paper"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-lg"
        >
          Skip to paper
        </a>
      )}

      {data ? (
        <ReaderToolbar
          data={data}
          url={url}
          onUrlChange={setUrl}
          onSubmit={load}
          loading={loading}
          error={error}
          onHome={goHome}
        />
      ) : (
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-start gap-3 px-4 sm:gap-5 sm:px-6">
            <BrandButton onClick={goHome} className="mt-1" />
            <div className="min-w-0 flex-1">
              <UrlBar
                url={url}
                onUrlChange={setUrl}
                onSubmit={load}
                loading={loading}
                error={error}
              />
            </div>
            <ThemeToggle />
          </div>
        </header>
      )}

      {!data && !loading && <Landing onExample={loadExample} />}

      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto flex max-w-[650px] flex-col items-center px-4 py-24 text-center"
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium text-foreground">
            Fetching the paper from arXiv…
          </p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-subtle">
            Parsing the paper and linking figures to the paragraphs that cite
            them.
          </p>
        </div>
      )}

      {data && (
        <main
          className={`mx-auto w-full max-w-[1400px] pb-[calc(3.5rem+env(safe-area-inset-bottom))] xl:items-stretch xl:px-4 xl:pb-0 ${
            data.figures.length > 0
              ? "xl:grid xl:grid-cols-[minmax(0,650px)_minmax(0,360px)] xl:justify-center xl:gap-6"
              : ""
          }`}
        >
          <ReaderBody
            data={data}
            activeParaId={activeParaId}
            onActiveParaChange={setActiveParaId}
          />
          {data.figures.length > 0 && (
            <FigureSidebar
              data={data}
              activeParaId={activeParaId}
              activeFigureIds={activeFigureIds}
            />
          )}
          <FigureSlot
            data={data}
            activeParaId={activeParaId}
            activeFigureIds={activeFigureIds}
          />
        </main>
      )}

      {hovering && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-background/60 p-6 backdrop-blur-sm"
        >
          <div className="rounded-2xl border-2 border-dashed border-accent bg-surface-raised px-8 py-10 text-center shadow-2xl">
            <p className="font-reading text-lg font-semibold text-foreground">
              Drop an arXiv link
            </p>
            <p className="mt-1 text-sm text-subtle">
              We&apos;ll open it in the reader.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
