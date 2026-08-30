/**
 * What the migration files say the schema is.
 *
 * Split out of check-schema-drift.mjs on 30 August so it can be tested. The
 * script that uses it talks to the network on import, which a unit test cannot;
 * this module is pure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Columns the deployed database is allowed to have that no migration declares.
 *
 * This list exists because of `customers.name`. `001_baseline.sql` uses
 * `CREATE TABLE IF NOT EXISTS` on tables the hand-made `supabase/schema.sql`
 * had already created, so in production the baseline was a no-op and that
 * table's original `name text NOT NULL` column survived underneath it. Nothing
 * in this repository could have found that: the drift check only ever compared
 * one way, and this is the other way.
 *
 * Every entry needs a reason and an exit. An allowlist without one is how a
 * check stops meaning anything.
 */
export const UNDECLARED_ALLOWLIST = new Map([
  [
    "customers.name",
    "Legacy, predates the migration files — see 017_customers_legacy_name_column.sql. " +
      "Kept nullable and auto-filled by trigger. This entry is expected to be SHORT-LIVED: the " +
      "decided repair for the migration replay (blueprint 10, 30 August) prepends " +
      "`ALTER TABLE customers ADD COLUMN IF NOT EXISTS name text` to 017, at which point the " +
      "column becomes declared and this entry must be deleted. If it is still here after that " +
      "lands, the allowlist is hiding something rather than explaining it.",
  ],
]);

/**
 * A table name, with the schema qualifier discarded if present.
 *
 * `alter table public.reservations` and `alter table reservations` name the same
 * table. The original pattern here was a bare `(\\w+)`, which matched neither
 * the qualifier nor the name when both were present — it saw `public`, looked
 * for `ADD COLUMN` next, found `.reservations`, and gave up silently.
 *
 * That was not cosmetic. Migrations switched to schema-qualified names when the
 * timestamped naming convention started, so **every table created since then
 * was invisible to the drift check** — `vehicle_blocks`, which the availability
 * allocator depends on, and `vehicle_change_requests` among them. The check went
 * on reporting success for tables it had never looked at, which is the exact
 * failure `.github/workflows/ci.yml` warns about in its own schema-drift step:
 * a check that reports success for something it did not look at is worse than
 * no check, because it gets believed.
 *
 * Found on 30 August by the reverse direction reporting `reservations.quote_id`
 * as undeclared when a migration declares it plainly.
 */
const TABLE = String.raw`(?:[a-z_][a-z0-9_$]*\s*\.\s*)?([a-z_][a-z0-9_$]*)`;

/**
 * Every column the migrations declare, as table → Set(column).
 *
 * Both forms have to be read: the baseline creates tables outright, while later
 * migrations add columns one at a time. Reading only CREATE TABLE would miss
 * everything added since, and reading only ALTER would miss the original schema.
 */
export function declaredColumns(migrationsDir) {
  const tables = new Map();
  const add = (t, c) => {
    if (!tables.has(t)) tables.set(t, new Set());
    tables.get(t).add(c);
  };

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");

    // CREATE TABLE [IF NOT EXISTS] name ( ... );
    const createTable = new RegExp(
      String.raw`CREATE TABLE(?:\s+IF NOT EXISTS)?\s+${TABLE}\s*\(([\s\S]*?)\n\s*\);`, "gi");
    for (const m of sql.matchAll(createTable)) {
      const table = m[1];
      for (const line of m[2].split("\n")) {
        // A column line starts at one indent level with a bare identifier.
        // Table-level constraints share that shape, so they are excluded by name.
        const col = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+\S/i);
        if (!col) continue;
        if (/^(primary|unique|constraint|check|foreign|references|exclude)$/i.test(col[1])) continue;
        add(table, col[1]);
      }
    }

    // `ONLY` is accepted because Postgres allows it and at least one migration
    // uses it; it changes inheritance behaviour, not which column is added.
    const addColumn = new RegExp(
      String.raw`ALTER TABLE\s+(?:ONLY\s+)?${TABLE}\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)`, "gi");
    for (const m of sql.matchAll(addColumn)) {
      add(m[1], m[2]);
    }

    // A column dropped later is no longer expected.
    const dropColumn = new RegExp(
      String.raw`ALTER TABLE\s+(?:ONLY\s+)?${TABLE}\s+DROP COLUMN(?:\s+IF EXISTS)?\s+([a-z_][a-z0-9_]*)`, "gi");
    for (const m of sql.matchAll(dropColumn)) {
      tables.get(m[1])?.delete(m[2]);
    }
  }

  return tables;
}

/**
 * Views the migrations create.
 *
 * PostgREST serves a view exactly like a table, so the reverse check would
 * report every one of a view's columns as undeclared — the column list of a
 * `CREATE VIEW ... AS SELECT` is not a declaration this parser can read. Views
 * are therefore excluded from the reverse direction by name. The forward
 * direction never saw them either, so nothing is lost.
 */
export function declaredViews(migrationsDir) {
  const views = new Set();
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const m of sql.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+(?:public\.)?(\w+)/gi)) {
      views.add(m[1]);
    }
    for (const m of sql.matchAll(/DROP\s+VIEW(?:\s+IF\s+EXISTS)?\s+(?:public\.)?(\w+)/gi)) {
      views.delete(m[1]);
    }
  }
  return views;
}
