import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every step of a multi-part action must be pinned to the same commit.
 *
 * `github/codeql-action` ships `init`, `autobuild` and `analyze` from one
 * repository at one tag: `init` downloads the CodeQL bundle that `analyze`
 * then reads. Dependabot, however, treats each path as its own dependency and
 * opens a pull request per path — #83 bumped `init` to v4.37.9 and left
 * `autobuild` and `analyze` on v4.37.5. Merged as offered it would have run a
 * split bundle, and nothing in the repository would have said so.
 *
 * So a pin is checked two ways: the SHA is what the whole action family shares,
 * and the trailing `# vX.Y.Z` comment is checked against it, because the
 * comment is the only thing a reviewer reads and a stale one is worse than
 * none.
 */

const WORKFLOWS = join(".github", "workflows");

/** `uses: owner/repo[/path]@<sha> # <version>` */
const USES =
  /uses:\s+([\w.-]+\/[\w.-]+)(\/[\w./-]+)?@([0-9a-f]{40})\s*#\s*(\S+)/g;

type Pin = { file: string; line: number; step: string; sha: string; version: string };

function pins(): Pin[] {
  const found: Pin[] = [];
  for (const name of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const file = join(WORKFLOWS, name);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        for (const m of text.matchAll(USES)) {
          found.push({
            file,
            line: index + 1,
            step: `${m[1]}${m[2] ?? ""}`,
            sha: m[3],
            version: m[4],
          });
        }
      });
  }
  return found;
}

describe("pinned GitHub Actions", () => {
  it("finds the SHA-pinned steps", () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuous, so the count is asserted before anything is derived from it.
    expect(pins().length).toBeGreaterThanOrEqual(4);
  });

  it("pins every step of one action repository to the same commit", () => {
    const byRepo = new Map<string, Pin[]>();
    for (const pin of pins()) {
      const repo = pin.step.split("/").slice(0, 2).join("/");
      byRepo.set(repo, [...(byRepo.get(repo) ?? []), pin]);
    }

    for (const [repo, group] of byRepo) {
      const shas = [...new Set(group.map((p) => p.sha))];
      expect(
        shas,
        `${repo} is pinned to ${shas.length} different commits:\n` +
          group.map((p) => `  ${p.file}:${p.line} ${p.step} ${p.version}`).join("\n"),
      ).toHaveLength(1);
    }
  });

  it("keeps the version comment consistent with the commit it labels", () => {
    const labels = new Map<string, string>();
    for (const pin of pins()) {
      const seen = labels.get(pin.sha);
      expect(
        seen ?? pin.version,
        `${pin.file}:${pin.line} labels ${pin.sha.slice(0, 7)} as ${pin.version}, ` +
          `but the same commit is labelled ${seen} elsewhere`,
      ).toBe(pin.version);
      labels.set(pin.sha, pin.version);
    }
  });
});
