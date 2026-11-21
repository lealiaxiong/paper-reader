"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseSourceInput, sourcePath } from "@/lib/sources";
import HomeHeader from "@/components/HomeHeader";
import Landing from "@/components/Landing";
import { useDropTarget } from "@/components/dropTarget";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPaper = useCallback(
    (input?: string) => {
      const target = (input ?? url).trim();
      if (!target) {
        setError("Paste an arXiv link to open a paper.");
        return;
      }
      const ref = parseSourceInput(target);
      if (!ref) {
        setError("That doesn't look like a supported paper link.");
        return;
      }
      setError(null);
      startTransition(() => router.push(sourcePath(ref)));
    },
    [url, router],
  );

  const loadExample = useCallback(
    (exampleUrl: string) => {
      setUrl(exampleUrl);
      openPaper(exampleUrl);
    },
    [openPaper],
  );

  const changeUrl = useCallback((value: string) => {
    setUrl(value);
    setError(null);
  }, []);

  const goHome = useCallback(() => {
    setUrl("");
    setError(null);
    window.scrollTo(0, 0);
  }, []);

  const handleDrop = useCallback(
    (text: string) => {
      const first = text.trim().split(/\s+/)[0];
      if (!first) return;
      setUrl(first);
      openPaper(first);
    },
    [openPaper],
  );

  const { hovering } = useDropTarget(handleDrop);

  return (
    <div className="min-h-full">
      <HomeHeader
        url={url}
        onUrlChange={changeUrl}
        onSubmit={() => openPaper()}
        loading={isPending}
        error={error}
        onHome={goHome}
      />

      <Landing onExample={loadExample} />

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
