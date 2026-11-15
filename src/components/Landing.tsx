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
    <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-10 sm:pt-16">
      <div className="grid min-w-0 items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            A reading view for arXiv papers.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-600">
            Paste a link above to open the paper in a 650px column. Figures
            appear in the side margin next to the paragraphs that mention them.
          </p>

          <div className="mt-7">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Examples
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => onExample(`https://arxiv.org/abs/${example.id}`)}
                  className="group rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-700 transition-colors hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800"
                >
                  {example.title}
                  <span className="ml-1.5 text-zinc-400 transition-colors group-hover:text-violet-500">
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
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-sm sm:p-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-4 sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="h-3 w-4/5 rounded bg-zinc-300" />
                  <div className="mt-2 h-2 w-2/5 rounded bg-zinc-200" />
                  <div className="mt-5 space-y-2">
                    <div className="h-1.5 w-full rounded bg-zinc-100" />
                    <div className="h-1.5 w-11/12 rounded bg-zinc-100" />
                    <div className="h-1.5 w-4/5 rounded bg-zinc-100" />
                  </div>
                  <div className="mt-3 rounded-r-md border-l-2 border-violet-400 bg-violet-50/80 py-1.5 pl-2 pr-1">
                    <p className="text-[10px] leading-snug text-violet-900/80 sm:text-[11px]">
                      Accuracy improves with model size (Figure 2).
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-1.5 w-full rounded bg-zinc-100" />
                    <div className="h-1.5 w-10/12 rounded bg-zinc-100" />
                    <div className="h-1.5 w-3/5 rounded bg-zinc-100" />
                  </div>
                </div>

                <div className="w-24 shrink-0 sm:w-32">
                  <div className="rounded-lg border border-violet-300 bg-white p-2 shadow-sm ring-2 ring-violet-100">
                    <div className="rounded bg-zinc-50 p-2">
                      <div className="flex h-14 items-end gap-1">
                        <div className="h-4 flex-1 rounded-sm bg-violet-200" />
                        <div className="h-6 flex-1 rounded-sm bg-violet-300" />
                        <div className="h-8 flex-1 rounded-sm bg-violet-400" />
                        <div className="h-12 flex-1 rounded-sm bg-violet-500" />
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-5/6 rounded bg-zinc-200" />
                    <div className="mt-1 h-1.5 w-3/5 rounded bg-zinc-100" />
                  </div>
                  <p className="mt-2 text-center text-[10px] leading-tight text-zinc-500">
                    Figure 2 · Accuracy by model size
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">
            The active paragraph highlights violet; its figure aligns beside it.
          </p>
        </div>
      </div>
    </section>
  );
}
