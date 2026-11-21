export type SourceId = "arxiv";

export type SourceRef = {
  source: SourceId;
  id: string;
};

type SourceDefinition = {
  id: SourceId;
  label: string;
  parseInput: (input: string) => string | null;
  parseId: (id: string) => string | null;
  path: (id: string) => string;
  externalUrl: (id: string) => string;
};

/** Extract an arXiv ID from abs/html/pdf links or a bare ID. */
export function extractArxivId(input: string): string | null {
  const m = input.match(/arxiv\.org\/(?:abs|html|pdf|export|list)\/(\d{4}\.\d{4,5})(v\d+)?/);
  if (m) return m[1];
  const bare = input.trim().match(/^(\d{4}\.\d{4,5})(v\d+)?$/);
  return bare ? bare[1] : null;
}

function parseArxivId(input: string): string | null {
  const bare = input.trim().match(/^(\d{4}\.\d{4,5})(v\d+)?$/);
  return bare ? bare[1] : null;
}

const arxiv: SourceDefinition = {
  id: "arxiv",
  label: "arXiv",
  parseInput: extractArxivId,
  parseId: parseArxivId,
  path: (id) => `/read/arxiv/${encodeURIComponent(id)}`,
  externalUrl: (id) => `https://arxiv.org/abs/${id}`,
};

const SOURCES: Record<SourceId, SourceDefinition> = { arxiv };

export function isSourceId(value: string): value is SourceId {
  return Object.prototype.hasOwnProperty.call(SOURCES, value);
}

export function parseSourceInput(input: string): SourceRef | null {
  for (const definition of Object.values(SOURCES)) {
    const id = definition.parseInput(input);
    if (id) return { source: definition.id, id };
  }
  return null;
}

export function parseSourceId(source: string, id: string): SourceRef | null {
  if (!isSourceId(source)) return null;
  const normalized = SOURCES[source].parseId(id);
  return normalized ? { source, id: normalized } : null;
}

export function parseSourceRoute(
  source: string,
  segments: readonly string[],
): SourceRef | null {
  if (segments.length === 0) return null;
  return parseSourceId(source, segments.join("/"));
}

export function sourcePath(ref: SourceRef): string {
  return SOURCES[ref.source].path(ref.id);
}

export function sourceExternalUrl(ref: SourceRef): string {
  return SOURCES[ref.source].externalUrl(ref.id);
}

export function sourceLabel(source: SourceId): string {
  return SOURCES[source].label;
}

export function sourceCitation(ref: SourceRef): string {
  return `${sourceLabel(ref.source)}:${ref.id}`;
}
