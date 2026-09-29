import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A job that runs a file out of this repository must check the repository out.
 *
 * `backup.yml` had never needed a checkout: every step was inline shell, so
 * there was nothing to fetch. #142 moved the dump behind
 * `scripts/safe-supabase-backup.mjs` — the right change, for a good reason —
 * and the job still had no checkout. The next run failed with
 *
 *   Error: Cannot find module '.../scripts/safe-supabase-backup.mjs'
 *
 * before it reached the database, so the off-site backup would have stored
 * nothing that night.
 *
 * Nothing caught it. The boundary test asserts the workflow *contains*
 * `node scripts/safe-supabase-backup.mjs`, and that was true the whole time:
 * the string was there and the file was not. A check on the text of a command
 * cannot tell whether the command can run.
 *
 * Split per job rather than per file, because a workflow where one job checks
 * out and another does not is exactly the case a file-wide search would miss.
 *
 * Parsed against the workflow indentation contract rather than with a YAML
 * library: `js-yaml` is present only transitively, ships no types, and has no
 * `@types` package here, so importing it fails the typecheck and would mean
 * adding two dependencies to guard one invariant. The parse is therefore
 * asserted before it is trusted — a reader that quietly matched nothing would
 * make this pass for the wrong reason.
 */

const WORKFLOWS = join(".github", "workflows");

/** A command that reaches for a file this repository owns. */
const REPO_PATH = /(^|[\s"'`(])(\.\/)?(scripts|lib|tests|supabase|app)\//;

type Job = { name: string; body: string };

function jobsIn(source: string): Job[] {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) return [];

  const jobs: Job[] = [];
  let current: Job | null = null;
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = { name: header[1], body: "" };
      jobs.push(current);
      continue;
    }
    if (current) current.body += line + "\n";
  }
  return jobs;
}

describe("workflow jobs that run repository code", () => {
  const files = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n));

  it("reads the workflows and their jobs", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    const all = files.flatMap((n) => jobsIn(readFileSync(join(WORKFLOWS, n), "utf8")));
    expect(all.length).toBeGreaterThanOrEqual(4);
    // The job this test exists for, named explicitly so a parser that stopped
    // recognising job headers cannot make the assertion below vacuous.
    expect(all.map((j) => j.name)).toContain("backup");
  });

  it("checks out the repository in every job that runs a file from it", () => {
    for (const name of files) {
      const file = join(WORKFLOWS, name);
      for (const job of jobsIn(readFileSync(file, "utf8"))) {
        const reaching = job.body
          .split("\n")
          .filter((l) => REPO_PATH.test(l) && !/^\s*#/.test(l) && !/uses:/.test(l));
        if (reaching.length === 0) continue;

        expect(
          /uses:\s*actions\/checkout@/.test(job.body),
          `${file} job "${job.name}" runs a file from this repository but never checks it out:\n` +
            reaching.map((l) => `    ${l.trim()}`).join("\n"),
        ).toBe(true);
      }
    }
  });
});
