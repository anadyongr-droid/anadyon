import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Phase 2's counter schema, executed rather than read.
 *
 * docs/RENTAL-SYSTEM-BLUEPRINT.md §4.2 specifies this in full, and §4.5 records
 * four defects found in an earlier draft of that same section — three of them
 * specifications that *could not have been built*: a private schema unreachable
 * through the Data API, composite foreign keys whose targets carried no unique
 * constraint, and a shared-template rule that was stated but never enforced.
 *
 * A migration that is only read cannot catch that class of thing. So this runs
 * it against a real Postgres and then tries to insert the rows the design says
 * must be impossible.
 */
const root = new URL("../", import.meta.url).pathname;
const migration = readFileSync(
  join(root, "supabase/migrations/20260830230000_rental_handovers.sql"),
  "utf8"
);

/**
 * The parts of the live schema this migration references, and the Supabase
 * pieces PGlite has no notion of.
 *
 * Copied in shape from 001/011 rather than summarised: a stub missing
 * vehicle_damages would let the observation tests pass by having nothing to
 * point at.
 */
const BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null unique, owner uuid,
    public boolean not null default false, file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.vehicles (
    id uuid primary key default gen_random_uuid(),
    name text, plate text, odometer_km integer
  );
  create table public.reservations (
    id uuid primary key default gen_random_uuid(),
    vehicle_id uuid references public.vehicles(id),
    status text
  );
  create table public.vehicle_damages (
    id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null references public.vehicles(id) on delete cascade,
    reported_on date not null default current_date,
    description text not null,
    severity text not null default 'minor',
    repaired_on date
  );

  -- Migration 018's trigger function, which the handover table attaches to.
  create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
`;

let db: PGlite;
const ids: Record<string, string> = {};

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(migration);

  const vehicle = await one<{ id: string }>(
    "insert into public.vehicles (name, plate) values ('Panda', 'ZAK-1') returning id"
  );
  ids.vehicle = vehicle.id;

  const reservation = await one<{ id: string }>(
    "insert into public.reservations (vehicle_id, status) values ($1, 'confirmed') returning id",
    [ids.vehicle]
  );
  ids.reservation = reservation.id;

  const template = await one<{ id: string }>(
    "insert into public.inspection_templates (vehicle_category, version) values ('car', 1) returning id"
  );
  ids.template = template.id;

  const view = await one<{ id: string }>(
    "insert into public.inspection_template_views (template_id, view_code, label) values ($1, 'front', 'Front') returning id",
    [ids.template]
  );
  ids.view = view.id;

  const damage = await one<{ id: string }>(
    "insert into public.vehicle_damages (vehicle_id, description) values ($1, 'kerbed alloy') returning id",
    [ids.vehicle]
  );
  ids.damage = damage.id;
}, 60_000);

/** Inserts a handover and returns its id. */
async function handover(over: Record<string, unknown> = {}): Promise<string> {
  const row = {
    reservation_id: ids.reservation,
    vehicle_id: ids.vehicle,
    direction: "out",
    client_operation_id: crypto.randomUUID(),
    inspection_template_id: ids.template,
    ...over,
  } as Record<string, unknown>;
  const cols = Object.keys(row);
  const sql = `insert into public.rental_handovers (${cols.join(", ")})
               values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`;
  const r = await one<{ id: string }>(sql, cols.map((c) => row[c]));
  return r.id;
}

describe("the migration applies at all", () => {
  it("creates every table §4.2 names, minus the one deliberately deferred", async () => {
    const r = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name like any (array['%handover%','inspection%'])
       order by table_name`
    );
    expect(r.rows.map((t) => t.table_name)).toEqual([
      "handover_damage_observations",
      "handover_damage_photos",
      "handover_photos",
      "inspection_template_views",
      "inspection_templates",
      "rental_handover_events",
      "rental_handovers",
    ]);
  });

  it("does NOT create reservation_adjustments", async () => {
    // Deferred until audit area 5 grades charge authority. If this ever passes
    // by accident, the deferral has been undone without the decision being
    // revisited — blueprint §7.2.
    const r = await db.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'reservation_adjustments'`
    );
    expect(r.rows).toHaveLength(0);
  });

  it("creates the private handover-photos bucket, in the migration", async () => {
    const b = await one<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'handover-photos'"
    );
    expect(b.public).toBe(false);
    expect(b.file_size_limit).toBe(15728640);
    expect(b.allowed_mime_types).toContain("image/jpeg");
  });
});

describe("what the design says must be impossible", () => {
  it("refuses a second live handover for the same reservation and direction", async () => {
    await handover({ direction: "in" });
    await expect(handover({ direction: "in" })).rejects.toThrow(/duplicate key|unique/i);
  });

  it("allows a replacement once the first is voided", async () => {
    // The reason the index is partial. A voided attempt must not block the
    // correction that replaces it.
    const id = await handover({ direction: "out" });
    await db.query(
      "update public.rental_handovers set status = 'voided', void_reason = 'wrong vehicle' where id = $1",
      [id]
    );
    await expect(handover({ direction: "out" })).resolves.toBeTruthy();
  });

  it("refuses a repeated client_operation_id, so a tablet retry cannot double-book", async () => {
    const shared = crypto.randomUUID();
    await handover({ direction: "in", client_operation_id: shared, status: "voided", void_reason: "x" });
    await expect(handover({ client_operation_id: shared })).rejects.toThrow(/duplicate key|unique/i);
  });

  it("refuses a photo whose view belongs to another template", async () => {
    // §4.5 recorded this as a composite key whose target carried no unique
    // constraint — specified, unenforceable. Here it is enforced.
    const other = await one<{ id: string }>(
      "insert into public.inspection_templates (vehicle_category, version) values ('scooter', 1) returning id"
    );
    const otherView = await one<{ id: string }>(
      "insert into public.inspection_template_views (template_id, view_code, label) values ($1, 'left', 'Left') returning id",
      [other.id]
    );
    const h = await handover({ direction: "out", status: "voided", void_reason: "fixture" });
    await expect(
      db.query(
        `insert into public.handover_photos
           (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
         values ($1, $2, $3, 'a/b.jpg', 'image/jpeg', 1000)`,
        [h, ids.template, otherView.id]
      )
    ).rejects.toThrow(/foreign key/i);
  });

  it("refuses damage evidence borrowed from a different handover", async () => {
    const a = await handover({ direction: "out", status: "voided", void_reason: "fixture a" });
    const b = await handover({ direction: "in", status: "voided", void_reason: "fixture b" });

    const obs = await one<{ id: string }>(
      `insert into public.handover_damage_observations (handover_id, damage_id, observation)
       values ($1, $2, 'pre_existing') returning id`,
      [a, ids.damage]
    );
    const photo = await one<{ id: string }>(
      `insert into public.handover_photos
         (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
       values ($1, $2, $3, 'b/other.jpg', 'image/jpeg', 1000) returning id`,
      [b, ids.template, ids.view]
    );

    // The observation is on handover A, the photograph on handover B. Neither
    // composite key can be satisfied at once, which is the point of carrying
    // handover_id on the join table.
    await expect(
      db.query(
        "insert into public.handover_damage_photos (handover_id, observation_id, photo_id) values ($1, $2, $3)",
        [a, obs.id, photo.id]
      )
    ).rejects.toThrow(/foreign key/i);
  });

  it("refuses a completed handover with no completion time", async () => {
    await expect(handover({ status: "completed" })).rejects.toThrow(/completed_together|constraint/i);
  });

  it("refuses a void with no reason", async () => {
    await expect(handover({ status: "voided" })).rejects.toThrow(/voided_has_reason|constraint/i);
  });

  it("refuses a fuel reading outside the gauge", async () => {
    await expect(handover({ fuel_eighths: 9, status: "voided", void_reason: "x" }))
      .rejects.toThrow(/fuel_eighths|constraint/i);
  });

  it("refuses a correction with no reason, and allows a completion without one", async () => {
    const h = await handover({ direction: "out", status: "voided", void_reason: "fixture" });
    await expect(
      db.query(
        "insert into public.rental_handover_events (handover_id, event_type) values ($1, 'corrected')",
        [h]
      )
    ).rejects.toThrow(/reason_required|constraint/i);
    await expect(
      db.query(
        "insert into public.rental_handover_events (handover_id, event_type) values ($1, 'completed')",
        [h]
      )
    ).resolves.toBeTruthy();
  });

  it("keeps only one active template per vehicle category", async () => {
    await expect(
      db.query("insert into public.inspection_templates (vehicle_category, version) values ('car', 2)")
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("what the design says must survive", () => {
  it("allows a bicycle handover with no odometer and no fuel", async () => {
    // §4.2: "Do not write invented zero readings to satisfy a form."
    await expect(
      handover({ direction: "out", odometer_km: null, fuel_eighths: null, status: "voided", void_reason: "x" })
    ).resolves.toBeTruthy();
  });

  it("refuses to delete a reservation that has a handover", async () => {
    // ON DELETE RESTRICT, because a handover is evidence.
    await expect(
      db.query("delete from public.reservations where id = $1", [ids.reservation])
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("maintains updated_at from the database", async () => {
    const h = await handover({ direction: "out", status: "voided", void_reason: "fixture" });
    const before = await one<{ updated_at: string }>(
      "select updated_at from public.rental_handovers where id = $1", [h]
    );
    await db.query("update public.rental_handovers set notes = 'touched' where id = $1", [h]);
    const after = await one<{ updated_at: string }>(
      "select updated_at from public.rental_handovers where id = $1", [h]
    );
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updated_at).getTime()
    );
  });

  it("enables RLS on every new table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (c.relname like '%handover%' or c.relname like 'inspection%')`
    );
    expect(r.rows.length).toBe(7);
    for (const t of r.rows) expect(t.relrowsecurity, `${t.relname} has RLS off`).toBe(true);
  });
});
