import Link from "next/link";
import packageJson from "../../package.json";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 py-6 font-sans text-[13px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>Paper Reader v{packageJson.version}</p>
          <nav aria-label="Project links" className="flex items-center gap-4">
            <Link
              href="/docs/pdf-only"
              className="transition-colors hover:text-foreground"
            >
              PDF-only papers
            </Link>
            <Link
              href="/changelog"
              className="transition-colors hover:text-foreground"
            >
              Changelog
            </Link>
            <a
              href="https://github.com/lealiaxiong/paper-reader"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
