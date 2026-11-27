"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sourceCitation,
  sourceExternalUrl,
  sourceLabel,
} from "@/lib/sources";
import type { ReaderPayload } from "@/lib/types";
import BrandButton from "./Brand";
import ThemeToggle from "./ThemeToggle";
import UrlBar from "./UrlBar";

type Props = {
  data: ReaderPayload;
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => boolean | void;
  loading: boolean;
  error: string | null;
  onHome: () => void;
  handoffExpiresAt?: string | null;
};

/**
 * Reading-mode header. Keeps the paper title and arXiv ID visible while a
 * compact "Open another" popover holds the URL form.
 */
export default function ReaderToolbar({
  data,
  url,
  onUrlChange,
  onSubmit,
  loading,
  error,
  onHome,
  handoffExpiresAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const paperRef = { source: data.source, id: data.sourceId };
  const isByom = data.provenance === "byom";
  const expiryLabel = handoffExpiresAt
    ? `${new Date(handoffExpiresAt).toISOString().replace("T", " ").slice(0, 16)} UTC`
    : null;

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 py-3 backdrop-blur">
      <div className="mx-auto flex h-10 max-w-[1400px] items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <BrandButton onClick={onHome} showWordmark={false} />

        <div className="min-w-0 flex-1">
          <p
            className="truncate font-reading text-[15px] font-semibold leading-5 text-foreground"
            title={data.title}
          >
            {data.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-subtle">
            <a
              href={sourceExternalUrl(paperRef)}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-accent"
              title={`View on ${sourceLabel(data.source)}`}
            >
              {sourceCitation(paperRef)}
            </a>
            {isByom && (
              <span
                className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent-strong"
                title={
                  expiryLabel
                    ? `Extracted by your own model. Link expires ${expiryLabel}.`
                    : "Extracted by your own model."
                }
              >
                Your model
              </span>
            )}
          </p>
        </div>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="open-another-panel"
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground sm:w-auto sm:px-3"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="sr-only sm:not-sr-only">Open another</span>
        </button>

        <ThemeToggle />
      </div>

      {open && (
        <div
          id="open-another-panel"
          ref={panelRef}
          role="region"
          aria-label="Open another paper"
          className="absolute inset-x-0 top-full border-b border-border bg-surface-raised p-3 shadow-xl sm:p-4"
        >
          <div className="mx-auto max-w-[720px]">
            <p className="mb-2 text-[11px] font-medium text-subtle">
              Open another paper
            </p>
            <UrlBar
              url={url}
              onUrlChange={onUrlChange}
              onSubmit={() => {
                if (onSubmit() !== false) setOpen(false);
              }}
              loading={loading}
              error={error}
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  );
}
