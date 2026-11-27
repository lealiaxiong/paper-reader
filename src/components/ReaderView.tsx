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
import SiteFooter from "./SiteFooter";

type Props = {
  source: SourceId;
  sourceId: string;
  handoffSlug?: string;
};

function readApiError(json: unknown): {
  message: string;
  code: string | null;
  docUrl: string | null;
  arxivId: string | null;
} {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: unknown }).error;
    if (typeof error === "string") {
      return { message: error, code: null, docUrl: null, arxivId: null };
    }
    if (error && typeof error === "object") {
      const object = error as Record<string, unknown>;
      const stringField = (key: string) =>
        typeof object[key] === "string" ? (object[key] as string) : null;
      return {
        message: stringField("message") ?? "Request failed",
        code: stringField("code"),
        docUrl: stringField("docUrl"),
        arxivId: stringField("arxivId"),
      };
    }
  }
  return { message: "Request failed", code: null, docUrl: null, arxivId: null };
}

export default function ReaderView({ source, sourceId, handoffSlug }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorArxivId, setErrorArxivId] = useState<string | null>(null);
  const [data, setData] = useState<ReaderPayload | null>(null);
  const [handoffExpiresAt, setHandoffExpiresAt] = useState<string | null>(null);
  const [handoffCreatedAt, setHandoffCreatedAt] = useState<string | null>(null);
  const [handoffClient, setHandoffClient] = useState<{
    name?: string;
    model?: string;
    skillVersion?: string;
  } | null>(null);
  const [activeParaId, setActiveParaId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    window.scrollTo(0, 0);

    (async () => {
      try {
        const res = handoffSlug
          ? await fetch(`/api/handoff/${encodeURIComponent(handoffSlug)}`, {
              headers: { Accept: "application/json" },
              signal: controller.signal,
            })
          : await fetch("/api/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source, id: sourceId }),
              signal: controller.signal,
            });

        let json: unknown;
        try {
          json = await res.json();
        } catch {
          throw new Error(`Request failed (${res.status})`);
        }

        if (!res.ok) {
          const apiError = readApiError(json);
          if (!controller.signal.aborted) {
            setError(apiError.message || `Request failed (${res.status})`);
            setErrorCode(apiError.code);
            setErrorArxivId(apiError.arxivId);
          }
          return;
        }
        if (controller.signal.aborted) return;

        const payload = json as {
          data?: ReaderPayload;
          arxivId?: string;
          expiresAt?: string;
          createdAt?: string;
          client?: {
            name?: string;
            model?: string;
            skillVersion?: string;
          };
        };

        if (handoffSlug) {
          if (payload.arxivId !== sourceId) {
            throw new Error("This handoff is for a different paper.");
          }
          if (!payload.data) throw new Error("The handoff is empty.");
          setHandoffExpiresAt(payload.expiresAt ?? null);
          setHandoffCreatedAt(payload.createdAt ?? null);
          setHandoffClient(payload.client ?? null);
        }

        if (!payload.data) throw new Error("The paper payload is missing.");
        setData(payload.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Network error");
        setErrorCode(null);
        setErrorArxivId(null);
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [source, sourceId, handoffSlug]);

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
    const showExpired = Boolean(handoffSlug) && !loading;
    return (
      <div className="min-h-full">
        <HomeHeader
          url={url}
          onUrlChange={changeUrl}
          onSubmit={() => {
            openPaper();
          }}
          loading={loading}
          error={showExpired ? null : error}
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
              {handoffSlug
                ? "This handoff link has expired."
                : "We couldn't open this paper."}
            </p>
            {handoffSlug ? (
              <div className="mx-auto mt-3 max-w-md rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm leading-relaxed text-muted">
                <p>
                  BYOM links are private and short-lived. Re-run your agent to
                  publish a new one for arXiv:{sourceId}.
                </p>
                <p className="mt-3 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/docs/pdf-only"
                    className="inline-flex items-center rounded-full border border-accent/30 bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-strong"
                  >
                    Publish a new link
                  </Link>
                  <a
                    href={`https://arxiv.org/pdf/${sourceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-strong"
                  >
                    Open the original PDF
                  </a>
                </p>
              </div>
            ) : (
              errorCode === "NO_HTML_AVAILABLE" &&
              errorArxivId && (
                <div className="mx-auto mt-3 max-w-md rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm leading-relaxed text-muted">
                  <p>
                    arXiv:{errorArxivId} appears to be PDF-only. It can still
                    be read with your own model.
                  </p>
                  <p className="mt-3 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/docs/pdf-only"
                      className="inline-flex items-center rounded-full border border-accent/30 bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-strong"
                    >
                      Read the PDF-only guide
                    </Link>
                    <a
                      href={`https://arxiv.org/pdf/${errorArxivId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-strong"
                    >
                      Open the original PDF
                    </a>
                  </p>
                </div>
              )
            )}
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
    <div className="flex min-h-full flex-col">
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
        handoffExpiresAt={handoffExpiresAt}
        handoffCreatedAt={handoffCreatedAt}
        client={handoffClient}
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
      <SiteFooter />
    </div>
  );
}
