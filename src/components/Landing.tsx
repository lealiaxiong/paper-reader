type Props = {
  onExample: (url: string) => void;
};

const EXAMPLES = [
  { title: "Attention Is All You Need", id: "1706.03762" },
  { title: "InstructGPT", id: "2203.02155" },
  { title: "State of AI", id: "2601.10088" },
];

/** Empty state: shows what the reader looks and feels like before a paper is loaded. */
export default function Landing({ onExample }: Props) {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      <div className="mx-auto grid min-w-0 max-w-[1200px] items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <h1 className="text-balance font-reading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            A reading view for arXiv papers.
          </h1>
          <p className="mt-5 max-w-xl font-reading text-[17px] leading-relaxed text-muted">
            Paste a link above to open the paper in a 650px column. Figures
            appear in a rail beside the text, next to the paragraphs that
            mention them.
          </p>

          <div className="mt-7">
            <p className="font-sans text-xs font-medium text-subtle">
              Examples
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => onExample(`https://arxiv.org/abs/${example.id}`)}
                  className="group rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent-strong"
                >
                  {example.title}
                  <span className="ml-1.5 text-subtle transition-colors group-hover:text-accent">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative mx-auto w-full min-w-0 max-w-[440px]"
        >
          <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
            <div className="rounded-xl border border-border bg-surface-raised p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4 sm:gap-6">
                <div className="min-w-0 flex-1 font-reading">
                  <div className="h-3 w-4/5 rounded bg-border-strong" />
                  <div className="mt-2 h-2 w-2/5 rounded bg-border" />
                  <div className="mt-5 space-y-2">
                    <div className="h-1.5 w-full rounded bg-border" />
                    <div className="h-1.5 w-11/12 rounded bg-border" />
                    <div className="h-1.5 w-4/5 rounded bg-border" />
                  </div>
                  <div className="mt-3 rounded-r-md border-l-[3px] border-accent bg-accent-soft py-1.5 pl-2 pr-1">
                    <p className="text-[11px] leading-snug text-accent-strong sm:text-xs">
                      Accuracy improves with model size (Figure 2).
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-1.5 w-full rounded bg-border" />
                    <div className="h-1.5 w-10/12 rounded bg-border" />
                    <div className="h-1.5 w-3/5 rounded bg-border" />
                  </div>
                </div>

                <div className="w-24 shrink-0 sm:w-32">
                  <div className="rounded-lg border border-accent-border bg-media p-2">
                    <div className="flex h-14 items-end gap-1">
                      <div className="h-4 flex-1 rounded-sm bg-violet-200" />
                      <div className="h-6 flex-1 rounded-sm bg-violet-300" />
                      <div className="h-8 flex-1 rounded-sm bg-violet-400" />
                      <div className="h-12 flex-1 rounded-sm bg-violet-500" />
                    </div>
                    <div className="mt-2 h-1.5 w-5/6 rounded bg-media-border" />
                    <div className="mt-1 h-1.5 w-3/5 rounded bg-media-border/60" />
                  </div>
                  <p className="mt-2 text-center font-sans text-xs leading-tight text-subtle">
                    Figure 2 · Accuracy by model size
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center font-sans text-[13px] text-subtle">
            The cited figure stays in view as you read.
          </p>
        </div>
      </div>
    </section>
  );
}
