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

/**
 * The replayed database carries `plpgsql` and nothing else, so this is the
 * inventory a correct comparison against it would have. It is a fixture on
 * purpose: the real `supabase/expected-extensions.json` is deliberately
 * unrecorded until a person reads production's list (W57), and the runner's
 * headline property -- silent on a correct database -- must stay testable
 * meanwhile.
 */
const inventory = (() => {
  const path = join(dir, "expected-extensions.json");
  writeFileSync(path, JSON.stringify({ recorded: "2026-10-05", extensions: ["plpgsql"] }));
  return path;
})();

async function runner(args: string[]): Promise<Result> {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args, "--extensions", inventory], {
      cwd: process.cwd(),
      maxBuffer: 10_000_000,
    });
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

describe("the workflow cannot go quiet when the check stops checking", () => {
  // Codex reported this twice, and it is the same defect as E21 in a second
  // place: the notification was gated on `steps.compare.outcome == 'failure'`
  // alone, so a missing secret or a failed production query — both of which
  // fail the job *before* the comparison — sent nothing. GitHub applies an
  // implicit `success()` to a step with no status function, so the alert was
  // skipped in exactly the circumstances where the monitor had stopped
  // monitoring.
  const workflow = readFileSync(".github/workflows/production-fingerprint.yml", "utf8");

  it("alerts on any earlier step's failure, not only the comparison's", () => {
    const alert = workflow.slice(workflow.indexOf("- name: Tell someone"));
    const condition = alert.slice(alert.indexOf("if:"), alert.indexOf("\n", alert.indexOf("if:")));
    expect(condition, "the alert is gated on the comparison alone").toContain("failure()");
    expect(condition, "a continue-on-error comparison still has to trigger it").toContain(
      "steps.compare.outcome",
    );
  });

  it("still says something when there is no report to quote", () => {
    // An early failure means report.md does not exist, and an alert whose body
    // is empty is an alert nobody can act on.
    expect(workflow).toMatch(/if \[ -f report\.md \]/);
    expect(workflow).toContain("NOT RUN");
  });

  it("refuses to run blind rather than passing when the secret is absent", () => {
    expect(workflow).toContain("SUPABASE_DB_URL is not set");
  });
});

describe("the runner refuses to pass on an unrecorded extension inventory", () => {
  /**
   * The other half of the fixture above. A check with nothing to compare
   * against must never look green — E21's defect, and the reason the real
   * `supabase/expected-extensions.json` is deliberately unrecorded rather than
   * self-seeded (W57).
   */
  it("exits 2 and names the inventory file when nobody has recorded it", async () => {
    const empty = join(dir, "unrecorded-extensions.json");
    writeFileSync(empty, JSON.stringify({ recorded: null, extensions: [] }));
    const actual = write("actual-inventory.json", expectedFingerprint);

    const result = await run("node", [SCRIPT, "--actual", actual, "--extensions", empty], {
      cwd: process.cwd(),
      maxBuffer: 10_000_000,
    }).catch((error: { code?: number; stdout?: string }) => ({
      stdout: error.stdout ?? "",
      code: error.code,
    }));

    expect(result.stdout).toContain("expected-extensions.json");
    expect(result.stdout).toContain("extensions.undeclared");
  }, 120_000);
});
