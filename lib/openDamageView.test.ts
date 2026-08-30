import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The fleet-wide damage endpoint must not be able to serve money.
 *
 * lib/damageVisibility.test.ts already pins the endpoint's `select` list, and
 * that was the only guard until 30 August. Outside review found it too thin and
 * was right: the realistic failure is not a test missing a change, it is a
 * refactor to `select("*")` that updates the now-failing pin in the same
 * commit — pinning tests get edited alongside the code they pin. Column grants
 * are no help either, because every application query runs under the service
 * role and the service role bypasses them.
 *
 * So the guard moves into the schema. What is asserted here is the property the
 * `select` list was only approximating: **`select *` against the view returns no
 * financial column**, because the view does not contain one. That is checked by
 * executing the real migration against a real Postgres, not by reading the SQL —
 * a text search cannot tell a column list from a comment about one, which this
 * repository has learned three times.
 */
const root = new URL("../", import.meta.url).pathname;
const migration = readFileSync(
  join(root, "supabase/migrations/20260830160000_vehicle_open_damage_view.sql"),
  "utf8"
);

/**
 * Enough of migration 011 to hang the view on, with the two financial columns
 * that matter present and populated. Copied from the migration rather than
 * summarised: a stub that omitted `repair_cost` would make this suite pass by
 * having nothing to leak.
 */
const BASE = `
  create table vehicle_damages (
    id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null,
    reservation_id uuid,
    reported_on date not null default current_date,
    description text not null,
    severity text not null default 'minor' check (severity in ('minor','moderate','major')),
    repair_cost numeric(10,2) check (repair_cost is null or repair_cost >= 0),
    charged_to_customer boolean default false,
    repaired_on date,
    photo_url text,
    notes text,
    created_at timestamptz default now()
  );
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
`;

let db: PGlite;
let columns: string[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(migration);
  await db.exec(`
    insert into vehicle_damages (vehicle_id, description, severity, repair_cost, charged_to_customer, repaired_on)
    values
      ('11111111-1111-1111-1111-111111111111', 'kerbed alloy', 'minor',    420.00, true,  null),
      ('22222222-2222-2222-2222-222222222222', 'cracked bumper','major',  1800.00, false, null),
      ('33333333-3333-3333-3333-333333333333', 'fixed already', 'major',   950.00, true,  current_date);
  `);
  const probe = await db.query<Record<string, unknown>>("select * from public.vehicle_open_damage");
  columns = Object.keys(probe.rows[0] ?? {});
}, 30_000);

describe("the vehicle_open_damage view", () => {
  it("returns rows at all, so the checks below are not vacuous", () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  it("cannot serve repair_cost through select *", async () => {
    // The whole point of the change. Not "the endpoint does not ask for it" —
    // "asking for everything does not return it".
    expect(columns).not.toContain("repair_cost");
    expect(columns).not.toContain("charged_to_customer");
  });

  it("serves exactly the four fields the summary needs", () => {
    expect([...columns].sort()).toEqual(["description", "reported_on", "severity", "vehicle_id"]);
  });

  it("hides repaired damage, in SQL rather than in JavaScript", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.vehicle_open_damage");
    expect(r.rows[0].n).toBe(2); // the third row is repaired
  });

  it("runs as the caller, not as its owner", () => {
    // Postgres defaults a view to the owner's privileges, which is how a view
    // becomes a way to read rows the caller could not read directly.
    expect(migration).toMatch(/security_invoker\s*=\s*true/);
  });

  it("is readable by the service role and nobody else", () => {
    expect(migration).toMatch(/revoke all on public\.vehicle_open_damage from public, anon, authenticated;/);
    expect(migration).toMatch(/grant select on public\.vehicle_open_damage to service_role;/);
  });
});

describe("the endpoint uses it", () => {
  const endpoint = readFileSync(
    join(root, "app/api/admin/vehicles/damages/route.ts"),
    "utf8"
  );

  it("reads the view, not the table it is protecting", () => {
    expect(endpoint).toMatch(/\.from\("vehicle_open_damage"\)/);
    expect(
      endpoint,
      "still querying vehicle_damages directly — the view is not doing anything"
    ).not.toMatch(/\.from\("vehicle_damages"\)/);
  });
});
