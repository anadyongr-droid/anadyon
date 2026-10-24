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

/**
 * `create [or replace] [materialized] view public.name` — the same question
 * for a view, which the model did not ask until 20 October 2026.
 *
 * **This is a preventive extension, not a fix, and the difference is worth
 * being exact about.** Migration 046 and the first version of this file both
 * reasoned about `create table`, and `public.vehicle_open_damage` is a view
 * created on 30 August 2026 — after 023's one-time blanket grant. That looked
 * like the tenth object 046 had missed, ten days before the deadline, and a
 * migration was written to close it.
 *
 * **It was already closed.** The view's own migration grants it on line 55:
 *
 *   grant select on public.vehicle_open_damage to service_role;
 *
 * The migration was withdrawn. What led to the wrong conclusion is worth
 * recording, because it is a trap in reading grants at all: production holds
 * **all eight** privileges on that view for `service_role` (read 20 October,
 * run 39493105577) while the migration grants exactly one. Production having
 * *more* than the repository explains read like the repository having *none* —
 * and the platform default had indeed added the other seven on top. §8 says
 * verify; it does not say a single reading cannot be misread.
 *
 * So the model now covers views because a *future* view created without a
 * grant would break a replayed database after 30 October, and nothing else
 * would notice: the nightly fingerprint's grant section filters
 * `relkind in ('r','p')`. Proved able to fail by injecting a synthetic
 * ungranted view, which it named.
 *
 * PostgreSQL makes no distinction here — `grant ... on` takes a view, and
 * `grant on all tables in schema public` covers views too — so a view belongs
 * in the same model rather than a parallel one.
 */
const CREATE_VIEW =
  /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;

/** A grant of table privileges to service_role, naming one table. */
const GRANT_TABLE = /grant\s+[^;]*?\son\s+(?:table\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+to\s+[^;]*service_role/gi;

/** `grant ... on all tables in schema public to ... service_role`. */
const GRANT_ALL_TABLES = /grant\s+[^;]*?\son\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*service_role/i;

/** Statements that grant on functions or sequences, not on tables. */
const NOT_A_TABLE_GRANT = /\bon\s+(?:function|sequence|all\s+(?:functions|sequences))\b/i;

function uncoveredRelations(): string[] {
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

    for (const pattern of [CREATE_TABLE, CREATE_VIEW]) {
      for (const m of sql.matchAll(pattern)) {
        const relation = m[1].toLowerCase();
        if (!covered.has(relation)) pending.add(relation);
      }
    }
  }

  return [...pending].sort();
}

describe("service_role grants survive a migration replay", () => {
  it("finds the migrations and the relations they create", () => {
    // A regex that quietly stopped matching would make the assertion below
    // pass by finding nothing, so the shape is checked before it is trusted.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThanOrEqual(40);
    const created = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(join(MIGRATIONS, f), "utf8").matchAll(CREATE_TABLE)]);
    expect(created.length).toBeGreaterThanOrEqual(25);

    // And the view regex, separately — a pattern that matched nothing would
    // make the assertion below pass by looking at an empty set, which is how
    // the view was missed in the first place.
    const views = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(join(MIGRATIONS, f), "utf8").matchAll(CREATE_VIEW)])
      .map((m) => m[1].toLowerCase());
    expect(views).toContain("vehicle_open_damage");
  });

  it("grants every table AND view it creates, so a fresh database is usable", () => {
    const uncovered = uncoveredRelations();
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
