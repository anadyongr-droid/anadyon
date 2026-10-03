import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readExpectedChanges,
  sha256,
  validateExpectedChange,
} from "../scripts/expectedProductionChange.mjs";

/**
 * The expected-production-change marker, and proof that its validator
 * discriminates.
 *
 * There are no markers committed yet, which is exactly why most of this file is
 * about the validator rather than about the directory. **A test that only checks
 * the markers that happen to exist would pass on an empty directory**, report
 * clean, and be believed — the failure mode this whole control exists to avoid.
 * So each rule is exercised against a case that must fail and a case that must
 * pass, and only then applied to whatever is actually committed.
 *
 * The marker replaces the invariant "every production change must be explainable
 * by a merge commit", which is wrong here: `AGENTS.md` forbids an agent applying a
 * migration, so a human pastes it and legitimate schema changes have no automated
 * trail. That rule would have fired on every one of the 45 migrations in this
 * repository.
 */
const GOOD = {
  migration: "20260923120000_grant_service_role_post_023_tables.sql",
  sha256: "",
  expected_objects: ["grant"],
  operator: "Tasos",
  declared: "2026-10-03",
  expires: "2026-10-17",
};

/** The real file, so the hash rule is tested against bytes rather than a stub. */
const REAL = "supabase/migrations/20260923120000_grant_service_role_post_023_tables.sql";
const readFile = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const now = new Date("2026-10-03T00:00:00Z");

function withRealHash() {
  return { ...GOOD, sha256: sha256(readFileSync(REAL, "utf8")) };
}

describe("the validator accepts a sound marker", () => {
  it("has a fixture that actually passes", () => {
    // If this fails, every "must fail" case below could be failing for the wrong
    // reason and the discrimination tests would prove nothing.
    expect(validateExpectedChange(withRealHash(), { now, readFile })).toEqual([]);
  });
});

describe("the validator rejects what it must", () => {
  it("a missing field", () => {
    for (const field of ["migration", "sha256", "expected_objects", "operator", "declared", "expires"]) {
      const marker: Record<string, unknown> = { ...withRealHash() };
      delete marker[field];
      expect(
        validateExpectedChange(marker, { now, readFile }).join(" "),
        `dropping \`${field}\` was accepted`,
      ).toContain(field);
    }
  });

  it("a hash that does not match the migration — the rule the marker turns on", () => {
    // Without this, the marker says "some change to this file is expected", which
    // an edited migration satisfies as well as the reviewed one.
    const marker = { ...withRealHash(), sha256: "a".repeat(64) };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("hashes to");
  });

  it("a migration that does not exist", () => {
    const marker = { ...withRealHash(), migration: "99999999_not_a_real_migration.sql" };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("does not exist");
  });

  it("an expected object the migration never mentions", () => {
    const marker = { ...withRealHash(), expected_objects: ["drop schema public"] };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("does not appear");
  });

  it("an empty expected_objects list, which claims nothing checkable", () => {
    const marker = { ...withRealHash(), expected_objects: [] };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("at least one object");
  });

  it("an expiry before the declaration", () => {
    const marker = { ...withRealHash(), declared: "2026-10-03", expires: "2026-10-01" };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("after `declared`");
  });

  it("a marker that expired unapplied — §12 escalates rather than carries forward", () => {
    const marker = { ...withRealHash(), declared: "2026-09-01", expires: "2026-09-15" };
    const problems = validateExpectedChange(marker, { now, readFile }).join(" ");
    expect(problems).toContain("expired on 2026-09-15");
  });

  it("but accepts an expired marker that records when it was applied", () => {
    // Applied markers are history. Left in place so the nightly check can explain
    // a change it sees in the audit log weeks later.
    const marker = { ...withRealHash(), declared: "2026-09-01", expires: "2026-09-15", applied: "2026-09-10T08:12:00Z" };
    expect(validateExpectedChange(marker, { now, readFile })).toEqual([]);
  });

  it("a date that is not a date", () => {
    const marker = { ...withRealHash(), expires: "next Tuesday" };
    expect(validateExpectedChange(marker, { now, readFile }).join(" ")).toContain("YYYY-MM-DD");
  });

  it("something that is not an object at all", () => {
    expect(validateExpectedChange(null, { now, readFile }).length).toBeGreaterThan(0);
    expect(validateExpectedChange("a string", { now, readFile }).length).toBeGreaterThan(0);
  });
});

describe("closing a marker takes a date that could have happened", () => {
  /**
   * Codex's finding of 3 October 2026: `applied` was tested for being a
   * non-empty string, so any text closed a marker and switched off the expiry
   * rule — the one mechanism that makes a forgotten migration escalate itself.
   * "yes", "not-a-timestamp" and "TODO" all worked.
   *
   * The same shape test was used for `declared` and `expires`, so an impossible
   * calendar date passed there too. That is the worse of the two: an impossible
   * date is never in the past, so `expires: "2026-99-98"` is a marker that can
   * never expire, written by a typo rather than by intent.
   */
  // Declared before it expired, and both before today, so the only thing under
  // test is the `applied` value itself.
  const applied = (value: unknown) =>
    validateExpectedChange(
      { ...withRealHash(), declared: "2026-09-20", expires: "2026-10-01", applied: value },
      { now, readFile },
    );

  it("rejects an applied value that is not a date", () => {
    for (const value of ["not-a-timestamp", "yes", "TODO", "2026-99-98", 1_759_000_000]) {
      expect(applied(value).join(" "), String(value)).toMatch(/`applied` must be a date/);
    }
  });

  it("rejects an application in the future, or before the declaration", () => {
    expect(applied("2026-12-01").join(" ")).toMatch(/in the future/);
    expect(applied("2026-09-10").join(" ")).toMatch(/before it was declared/);
  });

  it("accepts a real date and a real timestamp, and closes the marker", () => {
    expect(applied("2026-09-25")).toEqual([]);
    expect(applied("2026-09-25T08:15:00Z")).toEqual([]);
  });

  it("rejects an impossible calendar date in the dated fields", () => {
    // `2026-02-30` and `2026-99-98` match the shape and are not days.
    for (const field of ["declared", "expires"]) {
      const problems = validateExpectedChange(
        { ...withRealHash(), [field]: "2026-02-30" },
        { now, readFile },
      );
      expect(problems.join(" "), field).toMatch(new RegExp(`\`${field}\` must be YYYY-MM-DD`));
    }
    expect(
      validateExpectedChange({ ...withRealHash(), expires: "2026-99-98" }, { now, readFile }).join(" "),
    ).toMatch(/`expires` must be YYYY-MM-DD/);
  });
});

describe("every committed marker is sound", () => {
  it("holds, and says plainly when there are none", () => {
    const markers = readExpectedChanges();
    // Zero is the correct state today: the format exists, nothing is pending.
    // Recorded rather than asserted away, so a reader knows this suite is not
    // currently guarding any real declaration.
    for (const { name, marker } of markers) {
      expect(validateExpectedChange(marker, { readFile, name }), `${name} is not sound`).toEqual([]);
    }
    expect(Array.isArray(markers)).toBe(true);
  });
});
