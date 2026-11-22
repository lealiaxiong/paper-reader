"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseSourceInput, sourcePath } from "@/lib/sources";
import HomeHeader from "@/components/HomeHeader";
import Landing from "@/components/Landing";
import SiteFooter from "@/components/SiteFooter";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <HomeHeader
        url={url}
        onUrlChange={changeUrl}
        onSubmit={() => openPaper()}
        loading={isPending}
        error={error}
        onHome={goHome}
      />

      <main className="flex flex-1 flex-col justify-center">
        <Landing onExample={loadExample} />
      </main>
      <SiteFooter />
    </div>
  );
}
