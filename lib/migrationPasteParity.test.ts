import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every migration and the SQL-editor copy that is actually run must say the
 * same thing.
 *
 * Migration 033 was copied to its paste file and then edited further. The copy
 * was never refreshed, so the version run against production was the earlier
 * one — and the repository showed changes that production did not have. It cost
 * a blank "Customer email" column on every website booking and an
 * unretryable email guard, and nothing caught it: the migration test executed
 * both files but never compared them, so divergence passed twice.
 *
 * Compared after normalising comments and whitespace, because a few paste
 * copies are deliberately reflowed to fit the SQL editor's paste limit
 * (026 and 028 say so in their own headers). Formatting may differ; the SQL
 * may not.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const PASTE = join(MIGRATIONS, "paste");

/**
 * Strips comments and formatting, leaving the statements.
 *
 * Spacing around brackets and commas is normalised too: one copy writes
 * `coalesce( nullif(...)` and the other `coalesce(nullif(...)`, which is a
 * difference in typing, not in SQL. Applied identically to both sides, so a
 * genuine difference — a missing column in a RETURN, a dropped predicate on an
 * index — still shows.
 */
function normalise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    // The completion marker is an operator convenience and is deliberately
    // labelled per copy — "REACHED THE END — 028" against "… — customer field
    // parity" — so the text of that one string is not part of the comparison.
    // It changes nothing about the schema.
    .replace(/select\s*'reached the end[^;]*;/gi, "select 'REACHED THE END';")
    .trim()
    .toLowerCase();
}

/** Pairs a paste file with its migration by the descriptive part of the name. */
function pairs(): Array<{ migration: string; paste: string }> {
  const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const found: Array<{ migration: string; paste: string }> = [];

  for (const paste of readdirSync(PASTE).filter((f) => f.endsWith(".sql"))) {
    // "033_promo_ledger_seats_email_kinds_paste.sql" → "promo_ledger_seats_email_kinds"
    const slug = paste.replace(/^\d+[a-z]?_/, "").replace(/_paste\.sql$/, "");
    const migration = migrations.find((m) => m.replace(/^\d+_/, "").replace(/\.sql$/, "") === slug);
    if (migration) found.push({ migration, paste });
  }
  return found;
}

describe("migration and SQL-editor paste copies agree", () => {
  const matched = pairs();

  it("finds pairs to compare at all", () => {
    // A rename that broke the pairing would otherwise make this suite vacuous.
    expect(matched.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pairs())("$paste matches its migration", ({ migration, paste }) => {
    const a = normalise(readFileSync(join(MIGRATIONS, migration), "utf8"));
    const b = normalise(readFileSync(join(PASTE, paste), "utf8"));
    expect(b, `${paste} has drifted from ${migration} — the copy Tasos runs is not the migration in the repo`).toBe(a);
  });

  it("keeps the two fixes that were lost to the 033 drift", () => {
    const applied = readFileSync(join(PASTE, "033_promo_ledger_seats_email_kinds_paste.sql"), "utf8");
    // Returned so /api/quote can audit the acknowledgment against a reservation.
    expect(applied).toContain("'reservation_id', v_reservation_id");
    // Excluded so a hard-failed confirmation can be retried.
    expect(applied).toContain("status <> 'failed'");
  });

  it("ships a corrective migration for the copy already run in production", () => {
    const fix = readFileSync(join(PASTE, "034_fix_web_booking_reservation_id_paste.sql"), "utf8");
    // Dropped by name: `create ... if not exists` would keep the old index.
    expect(fix).toContain("drop index if exists public.booking_email_deliveries_once_per_kind_uniq");
    expect(fix).toContain("status <> 'failed'");
    expect(fix).toContain("'reservation_id', v_reservation_id");
    // Replaced, not dropped, so nothing depending on it breaks mid-migration.
    expect(fix).toContain("create or replace function public.create_web_booking");
  });
});
