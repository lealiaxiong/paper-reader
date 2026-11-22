import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  latestReleasedVersion,
  parseReleasedVersions,
  readChangelog,
} from "@/lib/changelog";

const markdown = readChangelog();
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { version: string };

describe("CHANGELOG.md", () => {
  it("keeps the latest released version in sync with package.json", () => {
    expect(latestReleasedVersion(markdown)?.version).toBe(packageJson.version);
  });

  it("has unique, dated semver release headings", () => {
    const releases = parseReleasedVersions(markdown);
    expect(releases.length).toBeGreaterThan(0);
    expect(new Set(releases.map((release) => release.version)).size).toBe(
      releases.length,
    );
    for (const release of releases) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
