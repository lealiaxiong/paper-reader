import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import SiteFooter from "@/components/SiteFooter";
import { latestReleasedVersion, readChangelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog · Paper Reader",
  description: "Release notes and notable changes to Paper Reader.",
};

const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-12 scroll-mt-24 border-t border-border pt-8 font-reading text-2xl font-semibold tracking-tight text-foreground first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-7 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-[15px] leading-relaxed text-muted">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-border-strong">
      {children}
    </ul>
  ),
  li: ({ children }) => (
    <li className="pl-1 text-[15px] leading-relaxed text-muted">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent-strong"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">
      {children}
    </code>
  ),
};

export default function ChangelogPage() {
  const raw = readChangelog();
  const markdown = raw.replace(/^# Changelog\s*\n+/, "");
  const latest = latestReleasedVersion(raw);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="border-b border-border pb-8">
          <Link
            href="/"
            className="font-sans text-xs font-medium text-subtle transition-colors hover:text-foreground"
          >
            ← Paper Reader
          </Link>
          <h1 className="mt-5 font-reading text-4xl font-semibold tracking-tight text-foreground">
            Changelog
          </h1>
          <p className="mt-3 max-w-xl font-reading text-[16px] leading-relaxed text-muted">
            Notable changes to Paper Reader. Newest first.
            {latest && (
              <>
                {" "}
                Current release: <strong>{latest.version}</strong>.
              </>
            )}
          </p>
        </header>

        <article className="mt-10">
          <ReactMarkdown components={components} skipHtml>
            {markdown}
          </ReactMarkdown>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
