import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Four eyes on the fleet record, executed rather than read.
 *
 * The interesting cases are not "does approving apply the change" — they are
 * the two a straightforward implementation gets wrong, and both are exercised
 * below against a real Postgres:
 *
 *   - approving must not overwrite a value somebody already fixed by hand;
 *   - approval and application are one act, so a request can never read
 *     "approved" over a vehicle that never changed.
 */
const MIGRATION = "supabase/migrations/20260830120000_vehicle_change_requests.sql";
const PASTE = "supabase/migrations/paste/038_vehicle_change_requests_paste.sql";

const BASE_SCHEMA = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create table public.vehicles (
    id uuid primary key default gen_random_uuid(),
    name text, category text, pricing_group text,
    status text default 'available',
    plate text, odometer_km integer, vehicle_notes text,
    kteo_expiry date, insurance_expiry date, road_tax_paid_until date,
    purchase_price numeric(10,2),
    created_at timestamptz default now());
`;

const read = (p: string) => readFile(join(process.cwd(), p), "utf8");

async function migrated(file = MIGRATION): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE_SCHEMA);
  await db.exec(await read(file));
  return db;
}

async function aCar(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vehicles (name, category, kteo_expiry, plate)
     values ('Nissan Micra', 'car', '2026-11-01', 'ZAK-1234') returning id`);
  return rows[0].id;
}

async function request(
  db: PGlite, vehicleId: string, changes: object, before: object,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vehicle_change_requests (vehicle_id, changes, before)
     values ($1, $2::jsonb, $3::jsonb) returning id`,
    [vehicleId, JSON.stringify(changes), JSON.stringify(before)]);
  return rows[0].id;
}

const approve = (db: PGlite, id: string, note: string | null = null) =>
  db.query(`select * from public.apply_vehicle_change_request($1, gen_random_uuid(), $2)`, [id, note]);

describe("approving applies the change", () => {
  it("writes the proposed value onto the vehicle", async () => {
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await approve(db, req);

    const { rows } = await db.query<{ kteo_expiry: string }>(
      `select kteo_expiry::text from public.vehicles where id = $1`, [car]);
    expect(rows[0].kteo_expiry).toBe("2027-03-01");
  });

  it("types the value properly rather than storing text that looks like a date", async () => {
    // jsonb_populate_record against the vehicles type is what does this. A
    // version that interpolated the value as text would fail here or store
    // something subtly wrong.
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car,
      { odometer_km: 41230, purchase_price: "8450.50" },
      { odometer_km: null, purchase_price: null });

    await approve(db, req);

    const { rows } = await db.query<{ odometer_km: number; purchase_price: string }>(
      `select odometer_km, purchase_price::text from public.vehicles where id = $1`, [car]);
    expect(rows[0].odometer_km).toBe(41230);
    expect(rows[0].purchase_price).toBe("8450.50");
  });

  it("leaves columns it was not asked about alone", async () => {
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await approve(db, req);

    const { rows } = await db.query<{ plate: string; name: string }>(
      `select plate, name from public.vehicles where id = $1`, [car]);
    expect(rows[0].plate).toBe("ZAK-1234");
    expect(rows[0].name).toBe("Nissan Micra");
  });

  it("records who decided and when", async () => {
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await approve(db, req, "checked against the certificate");

    const { rows } = await db.query<{ status: string; reviewed_at: string | null; review_note: string }>(
      `select status, reviewed_at, review_note from public.vehicle_change_requests where id = $1`, [req]);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].reviewed_at).not.toBeNull();
    expect(rows[0].review_note).toBe("checked against the certificate");
  });
});

describe("approving refuses to undo somebody's work", () => {
  it("rejects a request whose field changed since it was made", async () => {
    // Monday: staff propose 2027-03-01. Tuesday: an admin fixes it by hand to
    // 2027-05-05. Wednesday: approving the stale request would silently undo
    // Tuesday. This is the case worth the whole `before` column.
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await db.query(`update public.vehicles set kteo_expiry = '2027-05-05' where id = $1`, [car]);

    await expect(approve(db, req)).rejects.toThrow(/changed since this was requested/i);

    const { rows } = await db.query<{ kteo_expiry: string; status: string }>(
      `select v.kteo_expiry::text, r.status from public.vehicles v,
              public.vehicle_change_requests r where v.id = $1 and r.id = $2`, [car, req]);
    expect(rows[0].kteo_expiry, "Tuesday's value was overwritten").toBe("2027-05-05");
    expect(rows[0].status, "a refused approval still marked it approved").toBe("pending");
  });

  it("names the field that moved, so the reviewer knows what to look at", async () => {
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car,
      { kteo_expiry: "2027-03-01", plate: "ZAK-9999" },
      { kteo_expiry: "2026-11-01", plate: "ZAK-1234" });

    await db.query(`update public.vehicles set plate = 'ZAK-5555' where id = $1`, [car]);
    await expect(approve(db, req)).rejects.toThrow(/plate/);
  });

  it("allows approval when an unrelated field moved", async () => {
    // Only the fields the request touches are compared. An odometer reading
    // taken at handover must not invalidate a pending KTEO correction.
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await db.query(`update public.vehicles set odometer_km = 50000 where id = $1`, [car]);
    await expect(approve(db, req)).resolves.toBeTruthy();
  });
});

describe("approval and application are one act", () => {
  it("refuses to approve the same request twice", async () => {
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });

    await approve(db, req);
    await expect(approve(db, req)).rejects.toThrow(/already approved/i);
  });

  it("refuses a request that does not exist", async () => {
    const db = await migrated();
    await expect(
      db.query(`select public.apply_vehicle_change_request(gen_random_uuid(), gen_random_uuid(), null)`)
    ).rejects.toThrow(/does not exist/i);
  });
});

describe("what a request may name", () => {
  it("refuses a column that is not on vehicles", async () => {
    // The key is interpolated as an identifier inside a SECURITY DEFINER
    // function, so it is validated against the live column list rather than
    // trusted from the application.
    const db = await migrated();
    const car = await aCar(db);
    const req = await request(db, car, { drop_table_vehicles: 1 }, {});
    await expect(approve(db, req)).rejects.toThrow(/cannot be written/i);
  });

  it("refuses id and created_at even though they are real columns", async () => {
    const db = await migrated();
    const car = await aCar(db);
    for (const col of ["id", "created_at"]) {
      const req = await request(db, car, { [col]: "2020-01-01" }, {});
      await expect(approve(db, req)).rejects.toThrow(/cannot be written/i);
    }
  });

  it("refuses an empty proposal at the constraint", async () => {
    const db = await migrated();
    const car = await aCar(db);
    await expect(request(db, car, {}, {})).rejects.toThrow();
  });

  it("refuses a decision with no decider", async () => {
    const db = await migrated();
    const car = await aCar(db);
    await expect(db.query(
      `insert into public.vehicle_change_requests (vehicle_id, changes, before, status)
       values ($1, '{"plate":"X"}'::jsonb, '{}'::jsonb, 'approved')`, [car]
    )).rejects.toThrow();
  });
});

describe("the SQL-editor copy", () => {
  it("runs and behaves identically", async () => {
    // migrationPasteParity compares the text. This proves the copy actually
    // executes — a paste file has reached production stale before.
    const db = await migrated(PASTE);
    const car = await aCar(db);
    const req = await request(db, car, { kteo_expiry: "2027-03-01" }, { kteo_expiry: "2026-11-01" });
    await approve(db, req);
    const { rows } = await db.query<{ kteo_expiry: string }>(
      `select kteo_expiry::text from public.vehicles where id = $1`, [car]);
    expect(rows[0].kteo_expiry).toBe("2027-03-01");
  });
});
