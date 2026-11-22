import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleasedVersion = {
  version: string;
  date: string;
};

const RELEASED_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;

/** Read the repository changelog. Intended for build-time server rendering. */
export function readChangelog(): string {
  return readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
}

export function parseReleasedVersions(markdown: string): ReleasedVersion[] {
  return [...markdown.matchAll(RELEASED_HEADING)].map((match) => ({
    version: match[1],
    date: match[2],
  }));
}

export function latestReleasedVersion(markdown: string): ReleasedVersion | null {
  return parseReleasedVersions(markdown)[0] ?? null;
}
