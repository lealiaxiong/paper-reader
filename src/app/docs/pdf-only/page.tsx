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

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 marker:text-border-strong">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
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
            Some arXiv papers are PDF-only. Paper Reader can still read them:
            your agent opens the PDF and publishes a short-lived reading link
            using your model.
          </p>
        </header>

        <Section title="What you get">
          <p>
            Your agent reads the PDF and sends Paper Reader a JSON payload. The
            server checks it against the arXiv record and returns a private
            reading link (for example{" "}
            <Code>/read/arxiv/2512.00010?h=&lt;slug&gt;</Code>) that works for
            about six hours.
          </p>
          <p>
            The link expires. Save the paper or its arXiv PDF if you need the
            paper for longer. The deterministic HTML/ar5iv reader is still the
            preferred path whenever one exists.
          </p>
        </Section>

        <Section title="Before you start">
          <List
            items={[
              <span key="a">OpenCode installed.</span>,
              <span key="b">A model with usable quota or API access.</span>,
              <span key="c">
                A publisher token from the Paper Reader operator (see{" "}
                <Code>Publisher token</Code> below).
              </span>,
              <span key="d">
                Permission for the agent to download the arXiv PDF when it
                needs it.
              </span>,
            ]}
          />
        </Section>

        <Section title="Agent-assisted reading (OpenCode)">
          <p>
            Clone the repository, build the local MCP server, and install the
            skill:
          </p>
          <Pre>{`git clone https://github.com/lealiaxiong/paper-reader paper-reader
cd paper-reader
npm --prefix mcp run build
mkdir -p .opencode/skills
cp -R .opencode/skills/paper-reader .opencode/skills/`}</Pre>
          <p>
            Add the block below to your <Code>opencode.json</Code>, keeping any
            existing keys. Replace the base URL (for example, use your running
            local server or the deployed Paper Reader URL) and set{" "}
            <Code>PAPER_READER_TOKEN</Code> to the token from your operator.
          </p>
          <Pre>{`{
  "mcp": {
    "paper-reader": {
      "type": "local",
      "command": ["node", "/absolute/path/to/paper-reader/mcp/dist/server.js"],
      "environment": {
        "PAPER_READER_URL": "http://localhost:3000",
        "PAPER_READER_TOKEN": "{env:PAPER_READER_TOKEN}"
      }
    }
  }
}`}</Pre>
          <p>
            Restart OpenCode, then ask it to read the paper:
          </p>
          <Pre>{`Read arXiv 2512.00010 with the paper-reader skill and publish a Paper Reader link.`}</Pre>
          <p>
            The skill calls <Code>paper_format</Code>, reads the PDF natively
            (or rasterizes it locally when needed), calls{" "}
            <Code>publish_paper</Code>, and returns the short-lived URL.
          </p>
        </Section>

        <Section title="Publisher token">
          <p>
            Publishing is currently beta-gated. There is no self-serve signup:
            the Paper Reader operator adds your token to the server&apos;s
            settings. Ask the project owner for a publisher token, then set it
            as <Code>PAPER_READER_TOKEN</Code> in your shell or{" "}
            <Code>opencode.json</Code> before publishing. If the server returns{" "}
            <Code>503 PUBLISH_DISABLED</Code>, the deployment has no publisher
            tokens configured; if it returns <Code>401 UNAUTHORIZED</Code>,
            check the token in your MCP config. Personal accounts are planned,
            but you don&apos;t need one for beta publishing.
          </p>
        </Section>

        <Section title="Calling the API yourself">
          <p>
            Engineers can call the API directly. The payload must look like{" "}
            <Code>paper_format</Code> returns. Successful responses carry{" "}
            <Code>slug</Code>, <Code>url</Code>, <Code>expiresAt</Code>, and{" "}
            <Code>deduped</Code>.
          </p>
          <Pre>{`export PAPER_READER_URL="http://localhost:3000"
export PAPER_READER_TOKEN="your-publisher-token"

curl -X POST "$PAPER_READER_URL/api/publish" \\
  -H "authorization: Bearer $PAPER_READER_TOKEN" \\
  -H "content-type: application/json" \\
  --data-binary @payload.json`}</Pre>
          <p>
            <Code>409 HTML_AVAILABLE</Code> means use the deterministic reader;
            <Code>422</Code> means the metadata or figure source needs fixing;
            <Code>410</Code> means the link expired and the agent should rerun;
            <Code>429</Code> means retry; <Code>503</Code> means metadata or
            publishing is temporarily unavailable or disabled.
          </p>
        </Section>

        <Section title="Privacy and sharing">
          <p>
            Reading a handoff requires only the slug. Treat the full URL as a
            password: don&apos;t share it publicly or cite it as a stable
            source. Handoff pages are not indexed and send no referrer. When an
            HTML reader appears later, use that stable version.
          </p>
        </Section>

        <Section title="Troubleshooting">
          <List
            items={[
              <span key="mcp">
                MCP does not load: verify the server path exists, restart
                OpenCode, and run{" "}
                <Code>node /absolute/path/to/paper-reader/mcp/dist/server.js</Code>{" "}
                to see startup errors.
              </span>,
              <span key="token">
                <Code>401 UNAUTHORIZED</Code> or{" "}
                <Code>503 PUBLISH_DISABLED</Code>: verify your publisher token
                and the deployed <Code>PUBLISH_TOKENS</Code>.
              </span>,
              <span key="expired">
                Link expired: re-run the skill to publish a new one.
              </span>,
              <span key="html">
                <Code>409 HTML_AVAILABLE</Code>: open the normal Paper Reader
                page for that arXiv ID instead.
              </span>,
            ]}
          />
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
