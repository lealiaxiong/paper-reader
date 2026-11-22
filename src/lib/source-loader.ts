import { fetchPaperHtml, processPaper } from "./paper";
import type { SourceRef } from "./sources";
import type { ReaderData } from "./types";

/** Fetch and process a paper from its canonical source reference. */
export async function loadSourcePaper(ref: SourceRef): Promise<ReaderData> {
  switch (ref.source) {
    case "arxiv": {
      const paper = await fetchPaperHtml(ref.id);
      return processPaper(ref.id, paper.html, paper.baseUrl);
    }
  }
}
