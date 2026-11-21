import { fetchArxivHtml, processPaper } from "./paper";
import type { SourceRef } from "./sources";
import type { ReaderData } from "./types";

/** Fetch and process a paper from its canonical source reference. */
export async function loadSourcePaper(ref: SourceRef): Promise<ReaderData> {
  switch (ref.source) {
    case "arxiv":
      return processPaper(ref.id, await fetchArxivHtml(ref.id));
  }
}
