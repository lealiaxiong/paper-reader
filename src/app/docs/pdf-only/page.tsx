import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "PDF-only papers · Paper Reader",
  description:
    "Read PDF-only arXiv papers in Paper Reader with your own model: OpenCode skill, local MCP server, and manual publishing.",
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded bg-surface px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-[13px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-reading text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export default function PdfOnlyDocsPage() {
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
            PDF-only papers
          </h1>
          <p className="mt-3 max-w-xl font-reading text-[16px] leading-relaxed text-muted">
            Some arXiv papers have no HTML or ar5iv version. Paper Reader does
            not parse PDFs server-side. Instead, your own model can read the
            PDF and publish a short-lived reader link with your own quota.
          </p>
        </header>

        <Section title="What you get">
          <p>
            You provide a <Code>PUBLISH_TOKENS</Code>-backed publisher token. The
            server validates and sanitizes the JSON your agent produces, checks
            the title and authors against arXiv metadata, and returns an
            unlisted link such as <Code>/read/arxiv/2512.00010?h=&lt;slug&gt;</Code>.
          </p>
          <p>
            Handoffs are ephemeral: they expire after{" "}
            <Code>HANDOFF_TTL_SECONDS</Code> (default six hours) and never write
            to the deterministic <Code>paper:*</Code> cache. Figures may use{" "}
            <Code>tableHtml</Code> or <Code>pdfPage</Code>/<Code>bbox</Code>;{" "}
            <Code>imageUrl</Code> is rejected. PDF figure rendering is coming
            with M5; captions work today.
          </p>
        </Section>

        <Section title="Fastest path: OpenCode">
          <p>
            Build the local MCP server and add it to <Code>opencode.json</Code>,
            then install the skill in <Code>.opencode/skills/paper-reader/</Code>.
          </p>
          <Pre>{`npm --prefix mcp run build`}</Pre>
          <Pre>{`{
  "mcp": {
    "paper-reader": {
      "type": "local",
      "command": ["node", "/path/to/paper-reader/mcp/dist/server.js"],
      "environment": {
        "PAPER_READER_URL": "http://localhost:3000",
        "PAPER_READER_TOKEN": "your-publisher-token"
      }
    }
  }
}`}</Pre>
          <p>
            Restart OpenCode after changing the config, then ask it to read the
            paper. The skill calls <Code>paper_format</Code>, reads the PDF
            natively (or rasterizes locally when needed), calls{" "}
            <Code>publish_paper</Code>, and returns the URL.
          </p>
        </Section>

        <Section title="Manual publishing">
          <p>
            Engineers can call the API directly. The payload must look like{" "}
            <Code>paper_format</Code> returns. Successful responses carry{" "}
            <Code>slug</Code>, <Code>url</Code>, <Code>expiresAt</Code>, and{" "}
            <Code>deduped</Code>.
          </p>
          <Pre>{`curl -X POST "$PAPER_READER_URL/api/publish" \\
  -H "authorization: Bearer $PAPER_READER_TOKEN" \\
  -H "content-type: application/json" \\
  --data-binary @payload.json`}</Pre>
          <p>
            Useful responses: <Code>409 HTML_AVAILABLE</Code> means use the
            deterministic reader; <Code>422</Code> means the metadata or figure
            source needs fixing; <Code>410</Code> means the link expired and the
            agent should rerun.
          </p>
        </Section>

        <Section title="Privacy and sharing">
          <p>
            Reading a handoff requires only the slug, but the slug is the
            secret. Handoff pages use <Code>noindex</Code> and no referrer, and
            must not be treated as stable citations. The deterministic reader
            remains the better path whenever HTML or ar5iv exists.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
