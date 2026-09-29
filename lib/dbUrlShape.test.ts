import { describe, expect, it } from "vitest";
// Plain ESM helper shared with the scripts; `allowJs` types it from source.
import { describeDatabaseUrlShape } from "../scripts/schema-parity-lib.mjs";

/**
 * The diagnostic exists because a rejected connection string told us nothing.
 *
 * "failed to parse connection string" names no cause, and the value is a
 * secret nobody can read back, so diagnosing it meant guessing. The first
 * guess — percent-encoding — was wrong, and cost a round trip.
 *
 * It is only safe to print if it cannot leak, so that is what these assert:
 * every fact is a boolean, a count or a fixed label, checked against a URL
 * built entirely from distinctive markers.
 */
const MARKERS = {
  user: "USERMARKER",
  password: "PASSWORDMARKER",
  host: "HOSTMARKER",
  ref: "PROJECTREFMARKER",
};
const sample = `postgresql://${MARKERS.user}:${MARKERS.password}@db.${MARKERS.ref}.supabase.co:5432/postgres`;

describe("connection string shape report", () => {
  it("never echoes any part of the value", () => {
    const report = describeDatabaseUrlShape(sample).join("\n");
    for (const [part, marker] of Object.entries(MARKERS)) {
      expect(report, `the report leaked the ${part}`).not.toContain(marker);
    }
    // Nor a fragment of one: a truncated password is still a password.
    expect(report).not.toContain("PASSWORD");
    expect(report).not.toContain("MARKER");
  });

  it("reports a well-formed URL as sound", () => {
    const report = describeDatabaseUrlShape(sample).join("\n");
    expect(report).toContain("parses as a URL: yes");
    expect(report).toContain("scheme: postgresql:// — correct");
    expect(report).toContain("password characters: letters and digits only");
    expect(report).toContain("host: a supabase.co direct host");
    expect(report).toContain("database path: /postgres");
  });

  it.each([
    ["an unreplaced placeholder", `postgresql://postgres:[YOUR-PASSWORD]@db.x.supabase.co:5432/postgres`, "unreplaced placeholder: YES"],
    ["a trailing newline", `postgresql://postgres:abc@db.x.supabase.co:5432/postgres\n`, "surrounding whitespace: YES"],
    ["wrapping quotes", `"postgresql://postgres:abc@db.x.supabase.co:5432/postgres"`, "wrapping quotes: YES"],
    ["a psql command", `psql "postgresql://postgres:abc@db.x.supabase.co:5432/postgres"`, "starts with psql: YES"],
    ["a missing scheme", `db.x.supabase.co:5432/postgres`, "scheme: MISSING"],
    ["a misspelled scheme", `postgressql://postgres:abc@db.x.supabase.co:5432/postgres`, 'scheme: "postgressql://" — WRONG'],
    ["an internal space", `postgresql://postgres:ab c@db.x.supabase.co:5432/postgres`, "whitespace inside: YES"],
  ])("names %s", (_label, value, expected) => {
    expect(describeDatabaseUrlShape(value).join("\n")).toContain(expected);
  });

  it("says plainly when the value is absent", () => {
    expect(describeDatabaseUrlShape(undefined)).toEqual(["  present: no"]);
    expect(describeDatabaseUrlShape("")).toEqual(["  present: no"]);
  });
});
