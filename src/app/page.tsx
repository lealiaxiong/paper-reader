"use client";

import React, { useCallback, useState } from "react";
import type { ReaderPayload } from "@/lib/types";
import UrlBar from "@/components/UrlBar";
import ReaderBody from "@/components/ReaderBody";
import FigureSidebar from "@/components/FigureSidebar";
import FigureSlot from "@/components/FigureSlot";
import Landing from "@/components/Landing";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [data, setData] = useState<ReaderPayload | null>(null);
  const [activeParaId, setActiveParaId] = useState<string | null>(null);

  const load = useCallback(async (input?: string) => {
    const target = (input ?? url).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setCached(null);
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
      setCached(json.cached ?? false);
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
    setCached(null);
    setActiveParaId(null);
    window.scrollTo(0, 0);
  }, []);

  const activeFigureIds = React.useMemo(
    () => new Set<string>(activeParaId ? (data?.paraFigureMap[activeParaId] ?? []) : []),
    [activeParaId, data],
  );

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={goHome}
            aria-label="Paper Reader home"
            className="flex shrink-0 items-center gap-2 rounded-md"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-white">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 3.5h9M2.5 7h6.5M2.5 10.5h9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-zinc-900 sm:block">
              Paper Reader
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <UrlBar
              url={url}
              onUrlChange={setUrl}
              onSubmit={load}
              loading={loading}
              error={error}
              cached={cached}
            />
          </div>
        </div>
      </header>

      {!data && !loading && <Landing onExample={loadExample} />}

      {loading && (
        <div className="mx-auto flex max-w-[650px] flex-col items-center px-4 py-24 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-violet-600"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium text-zinc-800">
            Fetching the paper from arXiv…
          </p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
            Parsing the paper and linking figures to the paragraphs that cite
            them.
          </p>
        </div>
      )}

      {data && (
        <main className="mx-auto flex max-w-[1200px] flex-col items-center pb-14 lg:flex-row lg:items-start lg:justify-center lg:pb-0">
          <ReaderBody
            data={data}
            activeParaId={activeParaId}
            onActiveParaChange={setActiveParaId}
          />
          <FigureSidebar
            data={data}
            activeParaId={activeParaId}
            activeFigureIds={activeFigureIds}
          />
          <FigureSlot
            data={data}
            activeParaId={activeParaId}
            activeFigureIds={activeFigureIds}
          />
        </main>
      )}
    </div>
  );
}
