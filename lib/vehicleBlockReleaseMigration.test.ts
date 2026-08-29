import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const BLOCKS = "supabase/migrations/20260828120000_vehicle_blocks.sql";
const RELEASE = "supabase/migrations/20260829090000_vehicle_block_release.sql";
const RELEASE_PASTE = "supabase/migrations/paste/037_vehicle_block_release_paste.sql";

const BASE_SCHEMA = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create table public.vehicles (
    id uuid primary key default gen_random_uuid(), name text, category text,
    pricing_group text, status text default 'available', transmission text,
    turnaround_minutes integer, kteo_expiry date, insurance_expiry date,
    road_tax_paid_until date, next_service_due date, sort_order int default 0);
  create table public.reservations (
    id uuid primary key default gen_random_uuid(), vehicle_id uuid references public.vehicles(id),
    status text default 'pending', pickup_date date, pickup_time text,
    return_date date, return_time text);
`;

const read = (p: string) => readFile(join(process.cwd(), p), "utf8");

async function migrated(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE_SCHEMA);
  await db.exec(await read(BLOCKS));
  await db.exec(await read(RELEASE));
  return db;
}

async function aCar(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vehicles (name, category, pricing_group, transmission)
     values ('Peugeot 107', 'car', 'car_c', 'Automatic') returning id`);
  return rows[0].id;
}

/** The allocator, asked for an automatic car over the given dates. */
async function allocate(db: PGlite, from = "2026-09-10", to = "2026-09-14"): Promise<string | null> {
  const { rows } = await db.query<{ v: string | null }>(
    `select public.find_available_eligible_vehicle(
       'car_c','Cars','Automatic','Peugeot 107',$1::date,'09:00',$2::date,'09:00') as v`, [from, to]);
  return rows[0].v;
}

async function block(db: PGlite, vehicleId: string, startsOn: string, expectedReturn: string | null) {
  await db.query(
    `insert into public.vehicle_blocks (vehicle_id, reason, starts_on, expected_return)
     values ($1, 'maintenance', $2::date, $3::date)`, [vehicleId, startsOn, expectedReturn]);
}

describe("a block ends when a person says so", () => {
  it("applies over the blocks migration, and the paste copy is safe to re-run", async () => {
    const db = await migrated();
    try {
      await db.exec(await read(RELEASE_PASTE));
    } finally { await db.close(); }
  });

  it("renames ends_on to what it actually is", async () => {
    const db = await migrated();
    try {
      const cols = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='vehicle_blocks'`);
      const names = cols.rows.map((c) => c.column_name);
      expect(names).toContain("expected_return");
      expect(names).toContain("released_at");
      expect(names).toContain("released_by");
      expect(names, "ends_on implied the date ended something").not.toContain("ends_on");
    } finally { await db.close(); }
  });

  it("KEEPS THE VEHICLE OUT AFTER THE EXPECTED RETURN HAS PASSED", async () => {
    // The whole point, and the failure Tasos identified. The garage said the
    // 12th; nobody has confirmed the car is back. It must not quietly become
    // bookable on the 13th.
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", "2026-09-12");
      expect(await allocate(db, "2026-09-13", "2026-09-15"), "expired estimate must not release").toBeNull();
    } finally { await db.close(); }
  });

  it("keeps the vehicle out for dates far beyond the estimate", async () => {
    // A hard stop out of the ACTIVE FLEET, not a date range. Costs forward
    // bookings deliberately; the escape is the attested override, not a
    // softer rule here.
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", "2026-09-05");
      expect(await allocate(db, "2026-12-20", "2026-12-27"), "December is still blocked").toBeNull();
      expect(await allocate(db, "2027-07-01", "2027-07-08"), "next summer too").toBeNull();
    } finally { await db.close(); }
  });

  it("keeps it out when no estimate was given at all", async () => {
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", null);
      expect(await allocate(db)).toBeNull();
    } finally { await db.close(); }
  });

  it("frees the vehicle only once somebody records it back", async () => {
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", "2026-09-12");
      expect(await allocate(db)).toBeNull();

      // An explicit instant rather than now(): these fixtures are dated 2026 and
      // the wall clock is not, so now() can legitimately fall before the block
      // started and trip the constraint below for the wrong reason.
      await db.query(`update public.vehicle_blocks
                         set released_at = '2026-09-12T10:00:00Z', released_by = gen_random_uuid()
                       where vehicle_id = $1`, [car]);
      expect(await allocate(db), "a released block must stop blocking").toBe(car);
    } finally { await db.close(); }
  });

  it("does not block dates before the vehicle went out", async () => {
    // A block starting in October says nothing about a rental in September.
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-10-01", null);
      expect(await allocate(db, "2026-09-10", "2026-09-14")).toBe(car);
    } finally { await db.close(); }
  });

  it("refuses an estimate that precedes the day the vehicle went out", async () => {
    const db = await migrated();
    try {
      const car = await aCar(db);
      await expect(block(db, car, "2026-09-10", "2026-09-01"))
        .rejects.toThrow(/vehicle_blocks_dates_ordered/);
    } finally { await db.close(); }
  });

  it("refuses a release recorded before the block began", async () => {
    const db = await migrated();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-10", null);
      await expect(db.query(
        `update public.vehicle_blocks set released_at = '2026-09-01T09:00:00Z' where vehicle_id = $1`, [car],
      )).rejects.toThrow(/vehicle_blocks_released_after_start/);
    } finally { await db.close(); }
  });

  it("still applies the turnaround and statutory rules from the previous migration", async () => {
    // Replacing the function is where those get dropped by accident.
    const db = await migrated();
    try {
      const { rows } = await db.query<{ def: string }>(
        `select pg_get_functiondef(p.oid) as def from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='find_available_eligible_vehicle'`);
      const def = rows[0].def;
      expect(def).toContain("kteo_expiry");
      expect(def).toContain("insurance_expiry");
      expect(def.match(/turnaround_minutes/g) ?? []).toHaveLength(2);
    } finally { await db.close(); }
  });
});
