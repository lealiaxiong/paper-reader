"use client";

import BrandButton from "./Brand";
import ThemeToggle from "./ThemeToggle";
import UrlBar from "./UrlBar";

type Props = {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  onHome: () => void;
};

/** Landing/fallback header with the paper URL form. */
export default function HomeHeader({
  url,
  onUrlChange,
  onSubmit,
  loading,
  error,
  onHome,
}: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-start gap-3 px-4 sm:gap-5 sm:px-6">
        <BrandButton onClick={onHome} className="mt-1" />
        <div className="min-w-0 flex-1">
          <UrlBar
            url={url}
            onUrlChange={onUrlChange}
            onSubmit={onSubmit}
            loading={loading}
            error={error}
          />
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
