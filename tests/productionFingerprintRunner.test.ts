import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { queryJson, withReplayedDatabase } from "../scripts/replayedFingerprint.mjs";

/**
 * The nightly check run as the workflow runs it: a process, with files in and
 * an exit code out.
 *
 * **The property that decides whether this survives is silence.** A nightly job
 * that reports a difference on a correct database gets muted within a week, and
 * a muted alarm is worse than none because it still looks present — the
 * reasoning the expected-change marker exists for. So the first test takes the
 * expected fingerprint *as* production's and asserts the job exits 0 with
 * nothing to say. If the two sides of this comparison ever drift apart, that is
 * the test that fails.
 *
 * The others assert it discriminates, and that **it cannot report green when it
 * could not run** — the defect open item E21 records in CI's own drift check,
 * which exits successfully without comparing anything when its secrets are
 * missing.
 *
 * What no test here can do is run against production. That is recorded as not
 * run rather than assumed, per `DEFINING-STATEMENTS.md` §8: the first real run
 * is the first scheduled night, and its report is an artifact.
 */
const run = promisify(execFile);
const SCRIPT = "scripts/run-production-fingerprint.mjs";
const dir = mkdtempSync(join(tmpdir(), "fingerprint-"));

type Result = { code: number; stdout: string };

async function runner(args: string[]): Promise<Result> {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { cwd: process.cwd(), maxBuffer: 10_000_000 });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? "" };
  }
}

type Fingerprint = {
  tables: Record<string, { grants: Record<string, string[]> }>;
  [area: string]: unknown;
};

let expectedFingerprint: Fingerprint;

beforeAll(async () => {
  expectedFingerprint = await withReplayedDatabase((database) =>
    queryJson(database, "scripts/sql/production-fingerprint.sql"),
  );
}, 120_000);

const write = (name: string, value: unknown) => {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
};

describe("the runner, end to end", () => {
  it("is SILENT and exits 0 when production matches the migrations", async () => {
    // The anti-false-alarm test. Production's side here is literally the
    // expected side, so any difference the comparison reports is a bug in the
    // comparison rather than a fact about a database.
    const actual = write("actual-identical.json", expectedFingerprint);
    const counts = write("counts.json", { reservations: 10 });
    const previous = write("previous.json", { reservations: 10 });

    const { code, stdout } = await runner([
      "--actual", actual, "--counts", counts, "--previous", previous,
    ]);
    expect(stdout, "a correct database produced a difference").toContain("Production matches the repository");
    expect(code).toBe(0);
  }, 120_000);

  it("exits 3 and leads with CRITICAL when a customer table is granted to anon", async () => {
    const tampered = JSON.parse(JSON.stringify(expectedFingerprint));
    const victim = Object.keys(tampered.tables).find((name) => !["rates", "extras_config"].includes(name))!;
    tampered.tables[victim].grants.anon = ["SELECT"];

    const { code, stdout } = await runner(["--actual", write("actual-anon.json", tampered)]);
    expect(stdout).toContain("CRITICAL");
    expect(stdout).toContain(victim);
    expect(code).toBe(3);
  }, 120_000);

  it("exits 2 for an undeclared table, and 0 once a marker declares it", async () => {
    const tampered = JSON.parse(JSON.stringify(expectedFingerprint));
    tampered.tables.undeclared_export = {
      rls_enabled: false,
      rls_forced: false,
      columns: { id: "uuid not null" },
      grants: {},
      policies: {},
      triggers: [],
      indexes: [],
    };
    const actual = write("actual-extra.json", tampered);

    const unexplained = await runner(["--actual", actual]);
    expect(unexplained.stdout).toContain("undeclared_export");
    expect(unexplained.code).toBe(2);

    // This used to assert "No expected-change markers in force", which held only
    // while `supabase/expected-changes/` was empty — and it broke the hour the
    // first real marker was committed. The assertion was scaffolding pretending
    // to be a check.
    //
    // What it should say is the stronger thing, now that a marker does exist: a
    // declaration in force must **not** absorb a change it did not name. That is
    // the loose-matching risk in `explainWith`, exercised against whatever is
    // actually committed rather than against a stub.
    expect(unexplained.stdout).toMatch(/expected-change marker/);
    expect(
      unexplained.stdout,
      "a committed marker absorbed an unrelated table — the object matching is too loose",
    ).not.toMatch(/undeclared_export.*declared as/);
  }, 120_000);

  it("reports NOT RUN and exits 1 rather than passing, when it has no input", async () => {
    const missing = await runner(["--actual", join(dir, "does-not-exist.json")]);
    expect(missing.stdout).toContain("NOT RUN");
    expect(missing.code).toBe(1);

    const emptyPath = join(dir, "empty.json");
    writeFileSync(emptyPath, "");
    const empty = await runner(["--actual", emptyPath]);
    expect(empty.stdout, "an empty psql result is a failed query, not an empty database").toContain("NOT RUN");
    expect(empty.code).toBe(1);
  }, 60_000);

  it("writes a report and tomorrow's counts where the workflow expects them", async () => {
    const reportPath = join(dir, "report.md");
    const countsOut = join(dir, "counts-next.json");
    const { code } = await runner([
      "--actual", write("actual-again.json", expectedFingerprint),
      "--counts", write("counts-2.json", { reservations: 12 }),
      "--previous", write("previous-2.json", { reservations: 10 }),
      "--report", reportPath,
      "--counts-out", countsOut,
    ]);
    expect(code).toBe(0);
    expect(readFileSync(reportPath, "utf8")).toContain("# Production fingerprint");
    expect(JSON.parse(readFileSync(countsOut, "utf8"))).toEqual({ reservations: 12 });
  }, 120_000);

  it("escalates a row count that fell, even when the structure is perfect", async () => {
    const { code, stdout } = await runner([
      "--actual", write("actual-counts.json", expectedFingerprint),
      "--counts", write("counts-low.json", { reservations: 2 }),
      "--previous", write("previous-high.json", { reservations: 400 }),
    ]);
    expect(stdout).toContain("rows.fell");
    expect(code).toBe(2);
  }, 120_000);
});
