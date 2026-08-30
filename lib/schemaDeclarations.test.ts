import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Plain ESM helper, shared with scripts/check-schema-drift.mjs.
import { declaredColumns, declaredViews, UNDECLARED_ALLOWLIST } from "../scripts/schemaDeclarations.mjs";

/**
 * The reverse half of the schema drift check.
 *
 * Until 30 August `check-schema-drift.mjs` asked one question — does the
 * database have everything the migrations declare? — and `customers.name` had
 * been sitting on the other side of it since before the migration files
 * existed. 001_baseline.sql uses CREATE TABLE IF NOT EXISTS on tables the
 * hand-made supabase/schema.sql had already created, so the baseline was a
 * no-op in production and the original column survived beneath it. A migration
 * replay into an empty database tripped over it by accident, which is not a way
 * of finding things.
 *
 * These tests cover the parser both checks share, and pin the two cases that
 * make the reverse direction usable rather than permanently red.
 */
const REAL = join(process.cwd(), "supabase/migrations");

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

describe("reading what the migrations declare", () => {
  it("reads CREATE TABLE and ALTER TABLE ADD COLUMN together", () => {
    // Reading only one form is the failure this replaces: the baseline creates
    // tables outright, everything since adds columns one at a time.
    const dir = fixture({
      "001_a.sql": "CREATE TABLE IF NOT EXISTS widgets (\n  id uuid PRIMARY KEY,\n  label text\n);",
      "002_b.sql": "ALTER TABLE widgets ADD COLUMN IF NOT EXISTS colour text;",
    });
    expect([...declaredColumns(dir).get("widgets")].sort()).toEqual(["colour", "id", "label"]);
  });

  it("forgets a column a later migration drops", () => {
    const dir = fixture({
      "001_a.sql": "CREATE TABLE widgets (\n  id uuid PRIMARY KEY,\n  legacy text\n);",
      "002_b.sql": "ALTER TABLE widgets DROP COLUMN IF EXISTS legacy;",
    });
    expect(declaredColumns(dir).get("widgets").has("legacy")).toBe(false);
  });

  it("does not mistake a table-level constraint for a column", () => {
    const dir = fixture({
      "001_a.sql":
        "CREATE TABLE widgets (\n  id uuid PRIMARY KEY,\n  constraint widgets_uniq UNIQUE (id)\n);",
    });
    expect([...declaredColumns(dir).get("widgets")]).toEqual(["id"]);
  });
});

describe("schema-qualified names", () => {
  /**
   * The bug the reverse direction found on its first real run against
   * production, 30 August. It reported `reservations.quote_id` as undeclared
   * when 20260821175132_link_web_booking_customers.sql declares it plainly —
   * because the table-name pattern was a bare `(\w+)`, which matched neither
   * half of `public.reservations`. It saw `public`, looked for ADD COLUMN next,
   * found `.reservations`, and gave up without saying so.
   *
   * Migrations adopted schema-qualified names when the timestamped convention
   * started, so this was not one missed column: five whole tables were
   * invisible to the drift check, `vehicle_blocks` and
   * `vehicle_change_requests` among them. The forward direction had been
   * reporting success for tables it never looked at.
   */
  it("reads a schema-qualified CREATE TABLE", () => {
    const dir = fixture({
      "001_a.sql": "create table if not exists public.widgets (\n  id uuid primary key,\n  label text\n);",
    });
    expect([...declaredColumns(dir).get("widgets")].sort()).toEqual(["id", "label"]);
  });

  it("reads a schema-qualified ADD COLUMN split across lines", () => {
    // Exactly the shape that was missed, newline included.
    const dir = fixture({
      "001_a.sql": "create table public.widgets (\n  id uuid primary key\n);",
      "002_b.sql": "alter table public.widgets\n  add column if not exists colour uuid references public.paints(id);",
    });
    expect(declaredColumns(dir).get("widgets").has("colour")).toBe(true);
  });

  it("accepts ALTER TABLE ONLY", () => {
    const dir = fixture({
      "001_a.sql": "create table public.widgets (\n  id uuid primary key\n);",
      "002_b.sql": "alter table only public.widgets add column if not exists colour text;",
    });
    expect(declaredColumns(dir).get("widgets").has("colour")).toBe(true);
  });

  it("drops a schema-qualified column too", () => {
    const dir = fixture({
      "001_a.sql": "create table public.widgets (\n  id uuid primary key,\n  legacy text\n);",
      "002_b.sql": "alter table public.widgets drop column if exists legacy;",
    });
    expect(declaredColumns(dir).get("widgets").has("legacy")).toBe(false);
  });

  it("sees the five real tables that were invisible", () => {
    // Named individually rather than counted, so a future rename fails loudly
    // instead of quietly restoring the blind spot.
    const seen = declaredColumns(REAL);
    for (const t of [
      "vehicle_blocks",              // the availability allocator reads this
      "vehicle_change_requests",     // migration 038, four eyes on the fleet
      "booking_email_deliveries",
      "booking_email_events",
      "promo_redemptions",
    ]) {
      expect(seen.has(t), `${t} is invisible to the drift check`).toBe(true);
    }
  });

  it("declares reservations.quote_id, the column that exposed this", () => {
    expect(declaredColumns(REAL).get("reservations").has("quote_id")).toBe(true);
  });
});

describe("views", () => {
  it("finds them, so the reverse check can skip them", () => {
    // A view's columns come from a SELECT list, which this parser cannot read.
    // Without the skip, every view column reads as undeclared and the reverse
    // direction is red forever — which is how a check stops being believed.
    const dir = fixture({
      "001_a.sql": "create or replace view public.open_things\n  with (security_invoker = true)\nas select a, b from things;",
    });
    expect([...declaredViews(dir)]).toEqual(["open_things"]);
  });

  it("forgets a view a later migration drops", () => {
    const dir = fixture({
      "001_a.sql": "create view public.gone as select 1;",
      "002_b.sql": "drop view if exists public.gone;",
    });
    expect(declaredViews(dir).size).toBe(0);
  });

  it("sees the one this repository actually has", () => {
    expect(declaredViews(REAL).has("vehicle_open_damage")).toBe(true);
  });
});

describe("the defect the reverse direction exists for", () => {
  it("confirms customers.name is still undeclared", () => {
    // The finding itself, as a test rather than as a note. When the decided
    // repair to migration 017 lands — prepending ADD COLUMN IF NOT EXISTS —
    // this flips, and the allowlist entry below must be deleted with it.
    expect(declaredColumns(REAL).get("customers").has("name")).toBe(false);
  });

  it("excuses it, with a reason and an exit", () => {
    const reason = UNDECLARED_ALLOWLIST.get("customers.name");
    expect(reason, "the one known survivor is not excused, so the check is red forever").toBeTruthy();
    expect(reason).toMatch(/017/);
  });

  it("keeps the allowlist small and explained", () => {
    // An allowlist that grows without reasons is how a check stops meaning
    // anything. Every entry carries its own way out.
    for (const [key, reason] of UNDECLARED_ALLOWLIST) {
      expect(String(reason).length, `${key} is excused without a real reason`).toBeGreaterThan(40);
    }
    expect(UNDECLARED_ALLOWLIST.size).toBeLessThanOrEqual(3);
  });
});
