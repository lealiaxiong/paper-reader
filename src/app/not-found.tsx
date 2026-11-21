import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-[650px] flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-sans text-xs font-medium text-subtle">404</p>
      <h1 className="mt-2 font-reading text-2xl font-semibold text-foreground">
        Paper not found
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-subtle">
        That link doesn&apos;t point to a paper this reader supports.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        Back to home
      </Link>
    </main>
  );
}
