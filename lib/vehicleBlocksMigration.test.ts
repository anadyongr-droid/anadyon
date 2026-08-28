import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

// Each case starts its own in-process Postgres and replays the migration, which
// the default 5s limit is not enough for once the rest of the suite is
// competing for the machine.
vi.setConfig({ testTimeout: 60_000 });

const migrationPath = "supabase/migrations/20260828120000_vehicle_blocks.sql";
const pastePath = "supabase/migrations/paste/035_vehicle_blocks_paste.sql";

/**
 * Enough of the live schema for the migration to attach to, plus the version of
 * `find_available_eligible_vehicle` that shipped in 20260821223000 — the one
 * this migration replaces.
 *
 * Keeping the old function here rather than reading its migration file is
 * deliberate: that file also installs a trigger and runs a backfill over
 * `quotes`, none of which this migration touches, and pulling it in would make
 * a failure here ambiguous about which change caused it.
 */
const BASE_SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.vehicles (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null check (category in ('car', 'motorbike', 'bike')),
    pricing_group text not null,
    status text not null default 'available' check (status in ('available', 'maintenance', 'retired')),
    transmission text,
    turnaround_minutes integer,
    sort_order int default 0
  );

  create table public.reservations (
    id uuid primary key default gen_random_uuid(),
    vehicle_id uuid references public.vehicles(id),
    status text not null default 'pending',
    pickup_date date, pickup_time text,
    return_date date, return_time text
  );

  create or replace function public.find_available_eligible_vehicle(
    p_pricing_group text, p_vehicle_type text, p_transmission text, p_model text,
    p_pickup_date date, p_pickup_time text, p_return_date date, p_return_time text
  )
  returns uuid language plpgsql security definer set search_path = '' as $old$
  declare v_family text; v_vehicle_id uuid;
  begin
    if p_pickup_date is null or p_return_date is null then return null; end if;
    v_family := case p_pricing_group
      when 'car_a' then 'car' when 'car_b' then 'car' when 'car_c' then 'car'
      when 'motorbike_a' then 'motorbike' when 'bike' then 'bike' else null end;
    if v_family is null then return null; end if;
    select v.id into v_vehicle_id from public.vehicles v
     where v.status = 'available' and v.category = v_family
       and (p_transmission is null or lower(coalesce(v.transmission, '')) = lower(p_transmission))
       and not exists (
         select 1 from public.reservations r
          where r.vehicle_id = v.id and r.status not in ('cancelled', 'voided', 'no_show')
            and r.pickup_date < p_return_date and r.return_date > p_pickup_date)
     order by v.sort_order nulls last, lower(v.name), v.id
     for update of v skip locked limit 1;
    return v_vehicle_id;
  end;
  $old$;
`;

/** One automatic car, which every case below asks for. */
async function aCar(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vehicles (name, category, pricing_group, transmission)
     values ('Peugeot 107', 'car', 'car_c', 'Automatic') returning id`
  );
  return rows[0].id;
}

/** The allocation boundary, asked for an automatic car from the 10th to the 14th. */
async function allocate(db: PGlite, from = "2026-09-10", to = "2026-09-14"): Promise<string | null> {
  const { rows } = await db.query<{ v: string | null }>(
    `select public.find_available_eligible_vehicle(
       'car_c', 'Cars', 'Automatic', 'Peugeot 107', $1::date, '09:00', $2::date, '09:00') as v`,
    [from, to]
  );
  return rows[0].v;
}

async function block(db: PGlite, vehicleId: string, startsOn: string, endsOn: string | null, reason = "maintenance") {
  await db.query(
    `insert into public.vehicle_blocks (vehicle_id, reason, starts_on, ends_on)
     values ($1, $2, $3::date, $4::date)`,
    [vehicleId, reason, startsOn, endsOn]
  );
}

async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE_SCHEMA);
  await db.exec(await readFile(join(process.cwd(), migrationPath), "utf8"));
  return db;
}

describe("vehicle blocks migration", () => {
  it("applies, and the SQL Editor paste copy is safe to run over it", async () => {
    const db = await migratedDatabase();
    try {
      // Tasos runs the paste copy, sometimes after the migration has already
      // been applied. Re-running it must not error.
      await db.exec(await readFile(join(process.cwd(), pastePath), "utf8"));
    } finally {
      await db.close();
    }
  });

  it("the unfixed allocation boundary hands out a blocked vehicle", async () => {
    // The precondition, asserted before anything is claimed about the fix. With
    // the previous function in place the block is simply invisible: the vehicle
    // is in the workshop and the website allocates it anyway.
    const db = new PGlite();
    try {
      await db.exec(BASE_SCHEMA);
      // The table alone, without the new gate, so the difference under test is
      // the predicate and not the existence of somewhere to record a block.
      await db.exec(`
        create table public.vehicle_blocks (
          id uuid primary key default gen_random_uuid(),
          vehicle_id uuid not null references public.vehicles(id) on delete cascade,
          reason text not null, starts_on date not null, ends_on date, note text);
      `);
      const car = await aCar(db);
      await block(db, car, "2026-09-08", "2026-09-12");

      expect(await allocate(db), "the unfixed function should still allocate").toBe(car);

      await db.exec(await readFile(join(process.cwd(), migrationPath), "utf8"));
      expect(await allocate(db), "after the migration it must not").toBeNull();
    } finally {
      await db.close();
    }
  });

  it("refuses a vehicle blocked across the rental", async () => {
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-08", "2026-09-16");
      expect(await allocate(db)).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("still allocates a vehicle that is not blocked", async () => {
    // The other half. A gate that refuses everything passes the test above and
    // takes the business offline.
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      expect(await allocate(db)).toBe(car);
    } finally {
      await db.close();
    }
  });

  it("ignores a block that has ended before the rental starts", async () => {
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", "2026-09-09");
      expect(await allocate(db)).toBe(car);
    } finally {
      await db.close();
    }
  });

  it("ignores a block that starts after the rental ends", async () => {
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-15", "2026-09-20");
      expect(await allocate(db)).toBe(car);
    } finally {
      await db.close();
    }
  });

  it("treats both ends of a block as blocked days", async () => {
    // Inclusive, deliberately. A vehicle whose service ends on the 10th is not
    // available for a rental that collects on the 10th; the operator books the
    // day, not the hour.
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-05", "2026-09-10");
      expect(await allocate(db), "block ending on the pickup date").toBeNull();

      await db.query("delete from public.vehicle_blocks");
      await block(db, car, "2026-09-14", "2026-09-18");
      expect(await allocate(db), "block starting on the return date").toBeNull();
    } finally {
      await db.close();
    }
  });

  it("treats an open-ended block as blocking everything after it starts", async () => {
    // What an unroadworthy vehicle gets until somebody closes it. The failure to
    // avoid is coalesce(ends_on) defaulting to the start date and quietly
    // freeing the vehicle the next day.
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await block(db, car, "2026-09-01", null, "statutory");
      expect(await allocate(db)).toBeNull();
      expect(await allocate(db, "2027-06-01", "2027-06-05"), "still blocked a year later").toBeNull();
    } finally {
      await db.close();
    }
  });

  describe("turnaround between rentals", () => {
    /**
     * Found by a deliberate test: the whole manual fleet was booked out from
     * 30 August 09:00, a website request for 29 -> 30 August 09:00 was still
     * allocated a car, and no [NO VEHICLE] alert was raised.
     *
     * The old predicate padded only the EXISTING rental's return, so a new
     * booking returning at 09:00 could sit in front of an existing hire
     * collecting at 09:00 — no clean, no refuel, no inspection.
     */
    async function fleetBookedFrom30th(db: PGlite) {
      for (const name of ["Hyundai i20", "Hyundai Getz", "Fiat Panda"]) {
        const { rows } = await db.query<{ id: string }>(
          `insert into public.vehicles (name, category, pricing_group, transmission, turnaround_minutes)
           values ($1, 'car', 'car_c', 'Manual', 120) returning id`, [name]);
        await db.query(
          `insert into public.reservations (vehicle_id, status, pickup_date, pickup_time, return_date, return_time)
           values ($1, 'pending', '2026-08-30', '09:00', '2026-08-31', '09:00')`, [rows[0].id]);
      }
    }
    const askManual = async (db: PGlite, from: string, to: string, returnTime = "09:00") => {
      const { rows } = await db.query<{ v: string | null }>(
        `select public.find_available_eligible_vehicle(
           'car_c','Cars','Manual','Hyundai Getz',$1::date,'09:00',$2::date,$3) as v`, [from, to, returnTime]);
      return rows[0].v;
    };

    it("refuses a rental that would return a car with no changeover before the next hire", async () => {
      const db = await migratedDatabase();
      try {
        await fleetBookedFrom30th(db);
        expect(await askManual(db, "2026-08-29", "2026-08-30")).toBeNull();
      } finally {
        await db.close();
      }
    });

    it("allows the same rental once the gap covers the turnaround", async () => {
      // The other half. Padding both ends without checking this would refuse
      // every back-to-back booking and quietly cost the business rentals.
      const db = await migratedDatabase();
      try {
        await fleetBookedFrom30th(db);
        expect(await askManual(db, "2026-08-29", "2026-08-30", "06:00")).not.toBeNull();
      } finally {
        await db.close();
      }
    });

    it("leaves rentals nowhere near the existing booking alone", async () => {
      const db = await migratedDatabase();
      try {
        await fleetBookedFrom30th(db);
        expect(await askManual(db, "2026-08-27", "2026-08-28")).not.toBeNull();
      } finally {
        await db.close();
      }
    });
  });

  it("refuses a block whose dates run backwards", async () => {
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await expect(block(db, car, "2026-09-12", "2026-09-08")).rejects.toThrow(/vehicle_blocks_dates_ordered/);
    } finally {
      await db.close();
    }
  });

  it("refuses a reason it does not recognise", async () => {
    // The set is closed on purpose: a free-text reason becomes eleven spellings
    // of "service" and nothing can be reported on.
    const db = await migratedDatabase();
    try {
      const car = await aCar(db);
      await expect(block(db, car, "2026-09-08", "2026-09-12", "in the shop")).rejects.toThrow(/vehicle_blocks_reason_check/);
    } finally {
      await db.close();
    }
  });

  it("keeps the table and its function away from public roles", async () => {
    // Same posture as every other internal table: RLS on with no permissive
    // policy, and no grant left lying around for a future policy to inherit.
    const db = await migratedDatabase();
    try {
      const { rows: rls } = await db.query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class where oid = 'public.vehicle_blocks'::regclass`
      );
      expect(rls[0].relrowsecurity).toBe(true);

      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          `select has_table_privilege($1, 'public.vehicle_blocks', 'select') as ok`, [role]
        );
        expect(rows[0].ok, `${role} should hold no select`).toBe(false);
      }
    } finally {
      await db.close();
    }
  });
});
