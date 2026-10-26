import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGING_SEED_EXPECTATIONS,
  stagingSeedProblems,
  stagingSeedSummary,
} from "../scripts/stagingSeedFixtures.mjs";

/**
 * The staging seed verification, and the two tables it used to ignore.
 *
 * **Why this exists.** Until 24 October 2026 both verifiers of
 * `supabase/seeds/staging.sql` — `check-migration-replay.mjs` in CI and
 * `reset-staging.mjs` after a hosted reset — counted vehicles, customers and
 * reservations and said nothing about `rates` or `extras_config`.
 *
 * Those are the two tables `DEFINING-STATEMENTS.md` §6 grants to `anon`, and
 * §6's stated reason is that the public booking form cannot price a rental
 * without them. So a seed that loaded no rates would leave staging showing a
 * fleet it could not quote for, and **the reset would have reported success**.
 *
 * Codex raised the gap. Its framing was that the seed needed restoring and that
 * the runbook already claimed these counts were checked; neither is so — the
 * seed has carried 18 rates and 5 extras since it was written, and the runbook's
 * line is about their read-only *grants*, which `check-grants.mjs` does verify.
 * The gap in the count checks was real regardless, which is what these tests
 * hold shut.
 */

const seed = readFileSync(join("supabase", "seeds", "staging.sql"), "utf8");

/** Rows in one `insert into <table> … values (…), (…);` statement. */
function seededRowCount(table: string): number {
  const start = seed.indexOf(`insert into public.${table}`);
  expect(start, `the seed must still insert into ${table}`).toBeGreaterThan(-1);
  const body = seed.slice(start, seed.indexOf(";", start));
  const values = body.slice(body.indexOf("values"));
  return values.split("\n").filter((line) => /^\s*\(/.test(line)).length;
}

describe("the expected counts match what the seed actually inserts", () => {
  // The point of these two. A hand-written constant and a hand-written seed
  // drift the moment someone adds a pricing group and updates only one of
  // them -- and the failure mode is silent, because the verifier would then
  // be asserting the old number against the new seed and passing.
  it("counts 18 rate rows in the seed", () => {
    expect(seededRowCount("rates")).toBe(STAGING_SEED_EXPECTATIONS.rates);
  });

  it("counts 5 extras_config rows in the seed", () => {
    expect(seededRowCount("extras_config")).toBe(STAGING_SEED_EXPECTATIONS.extras);
  });

  it("keeps both inserts idempotent, because the seed is applied twice", () => {
    // check-migration-replay.mjs applies the seed a second time specifically to
    // prove idempotency. An insert without a conflict clause would make the
    // second pass either throw or double the count, and the counts above would
    // then be wrong for a reason nothing else here would explain.
    for (const table of ["rates", "extras_config"]) {
      const start = seed.indexOf(`insert into public.${table}`);
      const statement = seed.slice(start, seed.indexOf(";", start));
      expect(statement, `${table} must be re-runnable`).toMatch(/on conflict\s*\([^)]*\)\s*do update/i);
    }
  });
});

describe("a seed that cannot price is reported, not passed", () => {
  const healthy = {
    vehicles: 29,
    customers: 5,
    reservations: 6,
    rates: 18,
    extras: 5,
    openDamages: 1,
    bucket: true,
  };

  it("accepts the state the seed is meant to produce", () => {
    expect(stagingSeedProblems(healthy)).toEqual([]);
  });

  it("fails when no rates loaded, which is the case that used to pass", () => {
    const problems = stagingSeedProblems({ ...healthy, rates: 0 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toBe("expected 18 rates, found 0");
  });

  it("fails when no extras loaded", () => {
    expect(stagingSeedProblems({ ...healthy, extras: 0 })).toEqual(["expected 5 extras, found 0"]);
  });

  it("catches a partial load rather than only an empty one", () => {
    // The plausible real failure is not zero rows but some: a seed interrupted,
    // or a pricing group added to production and never to the fixture.
    expect(stagingSeedProblems({ ...healthy, rates: 15 })).toEqual(["expected 18 rates, found 15"]);
  });

  it("names every wrong count in one pass, so a reset is diagnosed once", () => {
    const problems = stagingSeedProblems({
      ...healthy,
      vehicles: 28,
      rates: 0,
      extras: 4,
      bucket: false,
    });
    expect(problems).toEqual([
      "expected 29 vehicles, found 28",
      "expected 18 rates, found 0",
      "expected 5 extras, found 4",
      "the private reservation-documents bucket is missing",
    ]);
  });

  it("treats a missing count as wrong rather than as absent", () => {
    // A caller that forgets to select rates must not get a pass by omission --
    // that is the original defect in a new costume.
    const { rates: _dropped, ...withoutRates } = healthy;
    expect(stagingSeedProblems(withoutRates as typeof healthy)).toEqual([
      "expected 18 rates, found none reported",
    ]);
  });

  it("treats open damages as a floor and absence as not asserted", () => {
    expect(stagingSeedProblems({ ...healthy, openDamages: 4 })).toEqual([]);
    expect(stagingSeedProblems({ ...healthy, openDamages: 0 })).toEqual([
      "expected at least 1 open damage, found 0",
    ]);
    const { openDamages: _skip, ...withoutDamages } = healthy;
    expect(stagingSeedProblems(withoutDamages)).toEqual([]);
  });
});

describe("the summary a person reads", () => {
  it("says pricing was checked, because that is the point of the change", () => {
    expect(stagingSeedSummary()).toContain("18 rates");
    expect(stagingSeedSummary()).toContain("5 extras");
  });
});
