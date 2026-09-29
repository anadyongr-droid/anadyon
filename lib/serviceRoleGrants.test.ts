import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table created in `public` must be granted to `service_role` by a
 * migration, not by the platform.
 *
 * Supabase is removing the automatic grant. From **30 October 2026**, a table
 * created in `public` receives no privileges for `anon`, `authenticated` or
 * `service_role` unless a GRANT says so. Existing tables keep what they have,
 * so production is unaffected — but anything built by *replaying* the
 * migrations is not: `supabase db reset`, the staging reset, a new project, a
 * preview branch. Those would create the tables and leave them unreachable by
 * the application, which talks to the database as `service_role` through
 * `supabaseAdmin`.
 *
 * Nothing else would catch it. `scripts/check-grants.mjs` asserts that anon
 * and authenticated hold *nothing* — it checks the deny side, and a database
 * where service_role also holds nothing passes it. `check:migration-replay`
 * runs against PGlite with Supabase roles stubbed, so grants there are
 * inert.
 *
 * The model below follows the migrations in order, because migration 023
 * grants `all privileges on all tables in schema public to service_role` and
 * that legitimately covers everything existing **at that moment**. Tables
 * created afterwards need their own grant, which
 * `booking_email_deliveries`, `booking_email_events` and `promo_redemptions`
 * already have — the convention existed, it was applied unevenly.
 */

const MIGRATIONS = join("supabase", "migrations");

/** `create table [if not exists] public.name (` — the form this repo uses. */
const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;

/** A grant of table privileges to service_role, naming one table. */
const GRANT_TABLE = /grant\s+[^;]*?\son\s+(?:table\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+to\s+[^;]*service_role/gi;

/** `grant ... on all tables in schema public to ... service_role`. */
const GRANT_ALL_TABLES = /grant\s+[^;]*?\son\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*service_role/i;

/** Statements that grant on functions or sequences, not on tables. */
const NOT_A_TABLE_GRANT = /\bon\s+(?:function|sequence|all\s+(?:functions|sequences))\b/i;

function uncoveredTables(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const pending = new Set<string>();
  const covered = new Set<string>();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");

    // A blanket grant covers everything created up to this point, and nothing
    // created after it — which is exactly why later tables are the problem.
    if (GRANT_ALL_TABLES.test(sql)) {
      for (const table of pending) covered.add(table);
      pending.clear();
    }

    for (const statement of sql.split(";")) {
      if (NOT_A_TABLE_GRANT.test(statement)) continue;
      for (const m of statement.matchAll(GRANT_TABLE)) {
        covered.add(m[1].toLowerCase());
        pending.delete(m[1].toLowerCase());
      }
    }

    for (const m of sql.matchAll(CREATE_TABLE)) {
      const table = m[1].toLowerCase();
      if (!covered.has(table)) pending.add(table);
    }
  }

  return [...pending].sort();
}

describe("service_role grants survive a migration replay", () => {
  it("finds the migrations and the tables they create", () => {
    // A regex that quietly stopped matching would make the assertion below
    // pass by finding nothing, so the shape is checked before it is trusted.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThanOrEqual(40);
    const created = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(join(MIGRATIONS, f), "utf8").matchAll(CREATE_TABLE)]);
    expect(created.length).toBeGreaterThanOrEqual(25);
  });

  it("grants every table it creates, so a fresh database is usable", () => {
    const uncovered = uncoveredTables();
    expect(
      uncovered,
      "These tables are created by a migration but never granted to service_role.\n" +
        "In production they work, because Supabase granted them automatically when\n" +
        "they were created. From 30 October 2026 a replayed migration will not, and\n" +
        "the application cannot reach them:\n" +
        uncovered.map((t) => `    ${t}`).join("\n"),
    ).toEqual([]);
  });
});
