import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A setup hook that boots a WASM PostgreSQL needs more than Vitest's default
 * ten seconds, and the budget belongs in one place.
 *
 * Fourteen test files construct a `PGlite` and replay migrations into it.
 * Measured on this four-core container, booting one and running `select 1`
 * costs **1.9s**, and the cost scales with how many boot at once because WASM
 * initialisation is CPU-bound and there are four cores to share:
 *
 * | Concurrent boots | slowest boot |
 * |---|---|
 * | 1 | 1.9s |
 * | 4 | 5.9s |
 * | 8 | **11.7s** |
 * | 14 | **21.3s** |
 *
 * So ten seconds is crossed at roughly seven simultaneous boots — before the
 * hook has replayed a single migration.
 *
 * **Reproduced, twice, rather than inferred.** Running the fourteen files at
 * `--maxWorkers=14` fails four of them, every one with `Hook timed out in
 * 10000ms`: `rpcStaffIdentity`, which boots in `beforeAll`, and
 * `checkInFinalisation`, `checkOutFinalisation` and `handoverCorrectionAndVoid`,
 * which boot in `beforeEach` and therefore boot once per test — around ninety
 * nine boots between them.
 *
 * **This is why it read as a flake.** Which files boot together is decided by
 * worker scheduling, so the full suite failed about two runs in eight and named
 * a different file each time. A failure that moves is easy to dismiss as
 * infrastructure noise, and `AGENTS.md` is explicit that it may not be until
 * that has been established. Here it is a budget that is simply too small, and
 * the evidence is that the two files which already carry a hand-set budget —
 * `openDamageView` at 30s and `rentalHandovers` at 60s — are never among the
 * failures.
 *
 * **It was being fixed one file at a time, which is what hid it.** Someone hit
 * the timeout on those two, raised that file's number, and moved on. A file with
 * its own budget stops failing and therefore stops reporting, so the remaining
 * hooks were one scheduling decision away from the same failure with nothing
 * pointing at them. That is the reason this test forbids the per-file form, not
 * a view that a local budget is wrong in principle.
 *
 * **What the budget is for.** A hook that initialises a database engine is
 * CPU-bound work making steady progress; a timeout's job there is to catch a
 * *hang*, not to police slowness on a loaded machine. Sixty seconds is about
 * thirty times the uncontended cost and still fails fast against a deadlock.
 *
 * **Deliberately not changed, and measured rather than assumed.** `testTimeout`
 * stays at its default. Eight of the fourteen files boot PGlite inside a test
 * body rather than a hook, so no shared hook budget reaches them. Seven pass at
 * the 5s default even fourteen-way. The eighth, `atomicBookingMigration`, failed
 * two of three forced runs at its own 20s and now carries 60s with the reasoning
 * at the end of that file — a per-test number, which is not what the paragraph
 * above warns against: that was a *hook* budget hiding a problem fixable in one
 * place, and it is now fixed in one place. Raising `testTimeout` globally would
 * weaken fifteen hundred fast tests to cover one, which is the wrong trade.
 *
 * **The two structural fixes are open items, not part of this.** Moving the
 * eight body-booting files' setup into hooks would let them inherit the shared
 * budget. And the three `beforeEach` files are the larger prize: a shared
 * instance would remove around ninety nine boots, but every one of their tests
 * currently gets a virgin database, and trading that isolation away is a
 * decision to take deliberately rather than inside a timeout fix.
 */
const CONFIG = "vitest.config.ts";
const LIB = "lib";
const SELF = basename(import.meta.filename);

/**
 * At least this many milliseconds, not exactly this many: a measurement on
 * slower hardware may justify raising it, and that should not also have to edit
 * this file.
 */
const MIN_HOOK_TIMEOUT_MS = 60_000;

const HOOKS = ["beforeAll", "beforeEach", "afterAll", "afterEach"] as const;

/**
 * The balanced text of every call to `name(` in `source`.
 *
 * A plain regex cannot do this: a hook body contains its own parentheses, so
 * matching to the first `)` stops inside the callback and would report every
 * hook as having no budget. Quotes and template literals are skipped so a `)`
 * inside a SQL string — and these files are full of SQL — does not unbalance
 * the count. Comments are not handled, which is safe in one direction only: a
 * commented-out hook would be read as real, never the reverse.
 */
function callsTo(source: string, name: string): string[] {
  const found: string[] = [];
  const opener = new RegExp(`\\b${name}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    let quote = "";
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") i += 1;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(source.slice(match.index, i + 1));
    opener.lastIndex = i + 1;
  }
  return found;
}

/** `beforeAll(async () => { … }, 30_000)` — a numeric budget on the hook itself. */
function hooksWithOwnBudget(source: string): string[] {
  return HOOKS.flatMap((hook) =>
    callsTo(source, hook)
      .filter((call) => /,\s*[\d_]+\s*\)$/.test(call))
      .map(() => hook),
  );
}

function pgliteTests(): string[] {
  return readdirSync(LIB)
    .filter((name) => name.endsWith(".test.ts") && name !== SELF)
    .filter((name) => /new PGlite\s*\(/.test(readFileSync(join(LIB, name), "utf8")))
    .sort();
}

describe("the PGlite hook budget lives in one place", () => {
  const files = pgliteTests();

  it("finds the files that boot PGlite, so the checks below are not vacuous", () => {
    // Fourteen at the time of writing. A smaller number means the detection
    // broke, not that the problem went away. This file is excluded by name —
    // it mentions `new PGlite(` in its own prose and would otherwise count
    // itself, which is how the first draft reported fifteen.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files).not.toContain(SELF);
  });

  it("can tell a hook budget from a test timeout", () => {
    // The distinction this test turns on, asserted rather than assumed. The
    // first draft matched `}, 20_000)` at the start of a line and flagged
    // `atomicBookingMigration`, whose 20s is the timeout of a single `it` and
    // is none of this test's business.
    expect(hooksWithOwnBudget(`beforeAll(async () => { f(); }, 30_000);`)).toEqual(["beforeAll"]);
    expect(hooksWithOwnBudget(`it("boots", async () => { f(); }, 20_000);`)).toEqual([]);
    expect(hooksWithOwnBudget(`beforeEach(async () => { await q("select ')'"); });`)).toEqual([]);
  });

  it("sets hookTimeout in vitest.config.ts", () => {
    const config = readFileSync(CONFIG, "utf8");
    const declared = /hookTimeout:\s*([\d_]+)/.exec(config);
    expect(
      declared,
      `${CONFIG} does not set hookTimeout, so every hook that boots a WASM PostgreSQL runs on Vitest's 10s default — crossed at about seven simultaneous boots, and reproduced as four files failing at --maxWorkers=14`,
    ).not.toBeNull();

    const ms = Number(declared![1].replace(/_/g, ""));
    expect(
      ms,
      `hookTimeout is ${ms}ms; booting PGlite alone took 11.7s at eight-way and 21.3s at fourteen-way contention on four cores`,
    ).toBeGreaterThanOrEqual(MIN_HOOK_TIMEOUT_MS);
  });

  it("leaves no file setting its own hook budget", () => {
    const offenders = files
      .map((name) => ({ name, hooks: hooksWithOwnBudget(readFileSync(join(LIB, name), "utf8")) }))
      .filter((entry) => entry.hooks.length > 0)
      .map((entry) => `${entry.name} (${entry.hooks.join(", ")})`);
    expect(
      offenders,
      `these pass their own timeout to a hook: ${offenders.join("; ")}. The shared budget in ${CONFIG} covers them, and a per-file number is how the other hooks stayed on the 10s default while these stopped reporting the problem.`,
    ).toEqual([]);
  });
});
