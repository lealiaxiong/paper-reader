"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseSourceInput,
  sourcePath,
  type SourceId,
} from "@/lib/sources";
import type { ReaderPayload } from "@/lib/types";
import FigureSidebar from "./FigureSidebar";
import FigureSlot from "./FigureSlot";
import HomeHeader from "./HomeHeader";
import ReaderBody from "./ReaderBody";
import ReaderToolbar from "./ReaderToolbar";

type Props = {
  source: SourceId;
  sourceId: string;
};

export default function ReaderView({ source, sourceId }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReaderPayload | null>(null);
  const [activeParaId, setActiveParaId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    window.scrollTo(0, 0);

    (async () => {
      try {
        const res = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, id: sourceId }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        if (!controller.signal.aborted) {
          setData(json.data as ReaderPayload);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Network error");
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [source, sourceId]);

  const changeUrl = useCallback((value: string) => {
    setUrl(value);
    setError(null);
  }, []);

  const openPaper = useCallback((): boolean => {
    const target = url.trim();
    if (!target) {
      setError("Paste an arXiv link to open a paper.");
      return false;
    }
    const ref = parseSourceInput(target);
    if (!ref) {
      setError("That doesn't look like a supported paper link.");
      return false;
    }
    setError(null);
    setUrl("");
    router.push(sourcePath(ref));
    return true;
  }, [url, router]);

  const goHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const activeFigureIds = useMemo(
    () =>
      new Set<string>(
        activeParaId ? (data?.paraFigureMap[activeParaId] ?? []) : [],
      ),
    [activeParaId, data],
  );

  if (!data) {
    return (
      <div className="min-h-full">
        <HomeHeader
          url={url}
          onUrlChange={changeUrl}
          onSubmit={() => {
            openPaper();
          }}
          loading={loading}
          error={error}
          onHome={goHome}
        />
        {loading ? (
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
              Fetching the paper…
            </p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-subtle">
              Parsing the paper and linking figures to the paragraphs that cite
              them.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-[650px] px-4 py-24 text-center">
            <p className="font-reading text-lg font-semibold text-foreground">
              We couldn&apos;t open this paper.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-subtle">
              Try another link above, or{" "}
              <Link
                href="/"
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-strong"
              >
                return home
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <a
        href="#paper"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-lg"
      >
        Skip to paper
      </a>

      <ReaderToolbar
        data={data}
        url={url}
        onUrlChange={changeUrl}
        onSubmit={openPaper}
        loading={loading}
        error={error}
        onHome={goHome}
      />

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
    </div>
  );
}
