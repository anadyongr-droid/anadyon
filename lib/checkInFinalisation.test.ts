import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { SUPABASE_COMPATIBILITY_STUBS } from "../scripts/pgliteSupabaseStubs.mjs";

/**
 * Check-in finalisation, executed rather than read.
 *
 * `docs/RENTAL-SYSTEM-BLUEPRINT.md` §4.2 rule 3, and rule 8 — which says the
 * inbound handover must use the outbound one's exact template, and which is
 * enforceable here or nowhere.
 *
 * The fixture runs a real check-out first rather than inserting a row that
 * looks like one. That costs a few hundred milliseconds per test and buys the
 * thing that matters: the state check-in is measured against is state the
 * system actually produced.
 */

const root = new URL("../", import.meta.url).pathname;
const migrationsDir = join(root, "supabase/migrations");

const MIGRATIONS = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"));

const IDS = {
  staff: "aaaaaaaa-0000-4000-8000-000000000001",
  vehicle: "bbbbbbbb-0000-4000-8000-000000000001",
  other: "bbbbbbbb-0000-4000-8000-000000000002",
  customer: "cccccccc-0000-4000-8000-000000000001",
  reservation: "dddddddd-0000-4000-8000-000000000001",
  template: "eeeeeeee-0000-4000-8000-000000000001",
  template2: "eeeeeeee-0000-4000-8000-000000000002",
  viewFront: "eeeeeeee-0000-4000-8000-000000000010",
  viewRear: "eeeeeeee-0000-4000-8000-000000000011",
  view2Front: "eeeeeeee-0000-4000-8000-000000000020",
  view2Rear: "eeeeeeee-0000-4000-8000-000000000021",
  outHandover: "ffffffff-0000-4000-8000-000000000001",
  inHandover: "ffffffff-0000-4000-8000-000000000002",
};

/** A rental checked out and ready to come back. */
const READY = `
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values ('${IDS.staff}', 'maria@anadyon.gr', '{"role":"staff"}', '{"full_name":"Maria"}');

  insert into public.vehicles (id, name, category, pricing_group, plate, status, odometer_km)
  values ('${IDS.vehicle}', 'Picanto', 'car', 'car_a', 'ZAK-1234', 'available', 41200),
         ('${IDS.other}',   'Aygo',    'car', 'car_a', 'ZAK-5678', 'available', 9000);

  insert into public.customers (id, first_name, last_name, full_name, driving_licence_expiry)
  values ('${IDS.customer}', 'Alex', 'Papadopoulos', 'Alex Papadopoulos', current_date + 400);

  insert into public.reservations (
    id, vehicle_id, customer_id, customer_name,
    pickup_date, pickup_time, return_date, return_time,
    rental_days, daily_rate, vehicle_subtotal, total, deposit, balance_due,
    status, agreement_signed_at
  ) values (
    '${IDS.reservation}', '${IDS.vehicle}', '${IDS.customer}', 'Alex Papadopoulos',
    current_date, '09:00', current_date + 3, '09:00',
    3, 40, 120, 120, 40, 80,
    'confirmed', now()
  );

  insert into public.inspection_templates (id, vehicle_category, version, active)
  values ('${IDS.template}',  'car',       1, true),
         ('${IDS.template2}', 'motorbike', 1, true);

  insert into public.inspection_template_views (id, template_id, view_code, label, sort_order, required)
  values
    ('${IDS.viewFront}',  '${IDS.template}',  'front', 'Front', 0, true),
    ('${IDS.viewRear}',   '${IDS.template}',  'rear',  'Rear',  1, true),
    ('${IDS.view2Front}', '${IDS.template2}', 'front', 'Front', 0, true),
    ('${IDS.view2Rear}',  '${IDS.template2}', 'rear',  'Rear',  1, true);

  insert into public.rental_handovers (
    id, reservation_id, vehicle_id, direction, status,
    client_operation_id, inspection_template_id,
    created_by, odometer_km, fuel_eighths, cleanliness
  ) values (
    '${IDS.outHandover}', '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft',
    gen_random_uuid(), '${IDS.template}', '${IDS.staff}', 41200, 8, 'clean'
  );

  insert into public.handover_photos
    (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
  values
    ('${IDS.outHandover}', '${IDS.template}', '${IDS.viewFront}', 'out/front.jpg', 'image/jpeg', 120000),
    ('${IDS.outHandover}', '${IDS.template}', '${IDS.viewRear}',  'out/rear.jpg',  'image/jpeg', 118000);
`;

/** The draft the customer's return produces. 300km on, three eighths down. */
const RETURNED = `
  insert into public.rental_handovers (
    id, reservation_id, vehicle_id, direction, status,
    client_operation_id, inspection_template_id,
    created_by, odometer_km, fuel_eighths, cleanliness
  ) values (
    '${IDS.inHandover}', '${IDS.reservation}', '${IDS.vehicle}', 'in', 'draft',
    gen_random_uuid(), '${IDS.template}', '${IDS.staff}', 41500, 5, 'acceptable'
  );

  insert into public.handover_photos
    (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
  values
    ('${IDS.inHandover}', '${IDS.template}', '${IDS.viewFront}', 'in/front.jpg', 'image/jpeg', 121000),
    ('${IDS.inHandover}', '${IDS.template}', '${IDS.viewRear}',  'in/rear.jpg',  'image/jpeg', 119000);
`;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_COMPATIBILITY_STUBS);
  for (const migration of MIGRATIONS) await db.exec(migration);
  await db.exec(READY);
  // The real thing, not a row shaped like it.
  await db.query(`select public.finalise_check_out_impl($1, $2, 'Maria')`, [
    IDS.outHandover,
    IDS.staff,
  ]);
  await db.exec(RETURNED);
});

async function finalise(handoverId = IDS.inHandover, actor: string | null = IDS.staff) {
  const res = await db.query<{ result: Record<string, unknown> }>(
    `select public.finalise_check_in_impl($1, $2, 'Maria') as result`,
    [handoverId, actor],
  );
  return res.rows[0].result;
}

async function refusalFor(damage: string): Promise<string | null> {
  await db.exec(damage);
  try {
    await finalise();
    return null;
  } catch (err) {
    return String((err as Error).message);
  }
}

describe("check-in refuses a contradiction", () => {
  it("refuses a reservation that is not active", async () => {
    const why = await refusalFor(
      `update public.reservations set status = 'cancelled' where id = '${IDS.reservation}';`,
    );
    expect(why).toMatch(/reservation is cancelled, not active/);
  });

  it("refuses a rental that was never checked out", async () => {
    // Without a completed out handover there is no odometer to compare against,
    // no fuel level, and no record of the car's condition when it left — a
    // dispute would have one photograph set and nothing to set it beside.
    const why = await refusalFor(
      `delete from public.rental_handovers where id = '${IDS.outHandover}';`,
    );
    expect(why).toMatch(/no completed check-out to compare against/);
  });

  it("refuses a rental whose check-out was started and never finished", async () => {
    // The realistic version: staff opened the check-out on the tablet, the
    // customer drove off, and nobody pressed the last button. A draft is not a
    // record of what left the yard.
    const why = await refusalFor(`
      delete from public.rental_handovers where id = '${IDS.outHandover}';
      insert into public.rental_handovers (
        reservation_id, vehicle_id, direction, status,
        client_operation_id, inspection_template_id, created_by
      ) values (
        '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft',
        gen_random_uuid(), '${IDS.template}', '${IDS.staff}'
      );
    `);
    expect(why).toMatch(/no completed check-out to compare against/);
  });

  it("cannot be voided by flipping status alone — the schema forbids it", async () => {
    // Not a check-in rule, and recorded here because building the test above
    // found it. `rental_handovers_completed_together` asserts
    // (status = 'completed') = (completed_at is not null), so voiding a
    // *completed* handover must clear completed_at in the same statement.
    //
    // That is a constraint the rule-4 void path has to satisfy, and the obvious
    // one-line implementation does not. Pinned so the next migration meets it
    // here rather than in production.
    await expect(db.exec(`
      update public.rental_handovers set status = 'voided', void_reason = 'wrong car'
       where id = '${IDS.outHandover}';
    `)).rejects.toThrow(/rental_handovers_completed_together/);

    await db.exec(`
      update public.rental_handovers
         set status = 'voided', void_reason = 'wrong car', completed_at = null
       where id = '${IDS.outHandover}';
    `);
  });

  it("refuses a check-in using a different inspection template", async () => {
    // Rule 8. §4.2: without it "an out/in comparison could silently compare a
    // car template against a scooter one" — and silently is the problem, since
    // the photos line up by view code and nothing looks wrong.
    const why = await refusalFor(`
      delete from public.handover_photos where handover_id = '${IDS.inHandover}';
      update public.rental_handovers set inspection_template_id = '${IDS.template2}'
       where id = '${IDS.inHandover}';
      insert into public.handover_photos
        (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
      values
        ('${IDS.inHandover}', '${IDS.template2}', '${IDS.view2Front}', 'in/f2.jpg', 'image/jpeg', 1000),
        ('${IDS.inHandover}', '${IDS.template2}', '${IDS.view2Rear}',  'in/r2.jpg', 'image/jpeg', 1000);
    `);
    expect(why).toMatch(/different inspection template from the check-out/);
  });

  it("refuses a check-in recording a different vehicle from the check-out", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set vehicle_id = '${IDS.other}' where id = '${IDS.inHandover}';`,
    );
    expect(why).toMatch(/a different vehicle was checked out/);
  });

  it("refuses an odometer that went backwards", async () => {
    // Not a reading — a contradiction. Either a digit was mistyped or this is
    // not the same car, and both need a person rather than a record.
    const why = await refusalFor(
      `update public.rental_handovers set odometer_km = 41199 where id = '${IDS.inHandover}';`,
    );
    expect(why).toMatch(/reads 41199, lower than the 41200 recorded at check-out/);
  });

  it("accepts an unchanged odometer — a car that did not move is not an error", async () => {
    await db.exec(
      `update public.rental_handovers set odometer_km = 41200 where id = '${IDS.inHandover}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ distance_km: 0 });
  });

  it("refuses when cleanliness was not recorded", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set cleanliness = null where id = '${IDS.inHandover}';`,
    );
    expect(why).toMatch(/cleanliness was not recorded/);
  });

  it("refuses poor cleanliness with no note", async () => {
    // Poor on return is what a cleaning charge would rest on, so it has to say
    // what was wrong while somebody is still looking at the car.
    const why = await refusalFor(
      `update public.rental_handovers set cleanliness = 'poor', notes = '  ' where id = '${IDS.inHandover}';`,
    );
    expect(why).toMatch(/cleanliness is poor, which requires a note/);
  });

  it("refuses a car with no odometer or no fuel reading", async () => {
    const noOdo = await refusalFor(
      `update public.rental_handovers set odometer_km = null where id = '${IDS.inHandover}';`,
    );
    expect(noOdo).toMatch(/odometer reading is required/);

    await db.exec(
      `update public.rental_handovers set odometer_km = 41500, fuel_eighths = null where id = '${IDS.inHandover}';`,
    );
    await expect(finalise()).rejects.toThrow(/fuel level is required/);
  });

  it("requires neither instrument on a bicycle", async () => {
    await db.exec(`
      update public.vehicles set category = 'bike', pricing_group = 'bike' where id = '${IDS.vehicle}';
      update public.rental_handovers set odometer_km = null, fuel_eighths = null
       where id = '${IDS.inHandover}';
    `);
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "returned" });
  });

  it("refuses a missing required photograph", async () => {
    const why = await refusalFor(
      `delete from public.handover_photos where handover_id = '${IDS.inHandover}' and template_view_id = '${IDS.viewRear}';`,
    );
    expect(why).toMatch(/1 required photograph\(s\) are missing/);
  });

  it("lists every reason at once", async () => {
    const why = await refusalFor(`
      update public.rental_handovers set cleanliness = null, odometer_km = 41000
       where id = '${IDS.inHandover}';
    `);
    expect(why).toMatch(/cleanliness was not recorded/);
    expect(why).toMatch(/lower than the 41200 recorded at check-out/);
  });
});

describe("check-in does not re-litigate the check-out", () => {
  /**
   * The asymmetry that shapes this function. Check-out decides whether a car
   * may leave; check-in records what came back, and the car is already back.
   * Refusing here prevents nothing — it only loses the record of what staff
   * saw, which is the one thing a later dispute needs.
   */

  it("accepts a return whose licence expired during the rental", async () => {
    await db.exec(
      `update public.customers set driving_licence_expiry = current_date - 1 where id = '${IDS.customer}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "returned" });
  });

  it("accepts a return on a vehicle that has since been blocked", async () => {
    // Booking it into the garage on the way in is the normal case, not an
    // obstacle to writing down its odometer.
    await db.exec(`
      insert into public.vehicle_blocks (vehicle_id, reason, starts_on)
      values ('${IDS.vehicle}', 'maintenance', current_date);
    `);
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "returned" });
  });

  it("accepts a return on a vehicle marked out of service", async () => {
    await db.exec(
      `update public.vehicles set status = 'maintenance' where id = '${IDS.vehicle}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "returned" });
  });

  it("accepts a return whose agreement record was cleared", async () => {
    await db.exec(
      `update public.reservations set agreement_signed_at = null where id = '${IDS.reservation}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "returned" });
  });
});

describe("check-in completes", () => {
  it("moves the reservation to returned and stamps the handover", async () => {
    const result = await finalise();
    expect(result).toMatchObject({
      reservation_status: "returned",
      already_completed: false,
      distance_km: 300,
      fuel_eighths_used: 3,
    });

    const { rows } = await db.query<{ status: string; completed_by: string; staff_name_snapshot: string }>(
      `select status, completed_by, staff_name_snapshot from public.rental_handovers where id = '${IDS.inHandover}'`,
    );
    expect(rows[0].status).toBe("completed");
    expect(rows[0].completed_by).toBe(IDS.staff);
    expect(rows[0].staff_name_snapshot).toBe("Maria");
  });

  it("moves the fleet odometer to the reading that has photographs attached", async () => {
    // Set, not raised. `greatest()` would preserve a larger number typed by hand
    // mid-rental — the value more likely to be wrong. A reading below the
    // check-out figure is refused earlier, so the one direction that must never
    // happen cannot reach here.
    await db.exec(`update public.vehicles set odometer_km = 99999 where id = '${IDS.vehicle}';`);
    await finalise();
    const { rows } = await db.query<{ odometer_km: number }>(
      `select odometer_km from public.vehicles where id = '${IDS.vehicle}'`,
    );
    expect(rows[0].odometer_km).toBe(41500);
  });

  it("leaves the fleet odometer alone when there is no instrument to read", async () => {
    await db.exec(`
      update public.vehicles set category = 'bike', pricing_group = 'bike' where id = '${IDS.vehicle}';
      update public.rental_handovers set odometer_km = null, fuel_eighths = null
       where id = '${IDS.inHandover}';
    `);
    await finalise();
    const { rows } = await db.query<{ odometer_km: number }>(
      `select odometer_km from public.vehicles where id = '${IDS.vehicle}'`,
    );
    expect(rows[0].odometer_km).toBe(41200);
  });

  it("records the measured differences in the audit event without charging for them", async () => {
    // §4.2: "check-in can record that a car came back three eighths down on fuel
    // and cannot yet raise a charge for it."
    await finalise();
    const { rows } = await db.query<{
      event_type: string;
      after_state: Record<string, unknown>;
      before_state: Record<string, unknown>;
    }>(`select event_type, after_state, before_state from public.rental_handover_events
          where handover_id = '${IDS.inHandover}'`);

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("completed");
    expect(rows[0].before_state.status).toBe("draft");
    expect(rows[0].after_state.reservation_status).toBe("returned");
    expect(rows[0].after_state.distance_km).toBe(300);
    expect(rows[0].after_state.fuel_eighths_used).toBe(3);
    expect(rows[0].after_state.out_handover_id).toBe(IDS.outHandover);
  });

  it("has nowhere to write a charge, and a test says so", async () => {
    // The deferral is structural, not a habit. If reservation_adjustments
    // appears without the area-5 decision being revisited, this fails.
    const { rows } = await db.query<{ present: boolean }>(
      `select to_regclass('public.reservation_adjustments') is not null as present`,
    );
    expect(rows[0].present).toBe(false);
  });

  it("reports a null difference rather than a zero when an instrument is absent", async () => {
    // A bicycle did not travel 0 km; it travelled an unrecorded distance. §4.2:
    // "do not write invented zero readings to satisfy a form" applies to what
    // is derived from them too.
    await db.exec(`
      update public.vehicles set category = 'bike', pricing_group = 'bike' where id = '${IDS.vehicle}';
      update public.rental_handovers set odometer_km = null, fuel_eighths = null
       where id = '${IDS.inHandover}';
    `);
    const result = await finalise();
    expect(result.distance_km).toBeNull();
    expect(result.fuel_eighths_used).toBeNull();
  });
});

describe("a tablet that submits twice", () => {
  it("returns the same completed handover instead of failing", async () => {
    const first = await finalise();
    const second = await finalise();
    expect(first.already_completed).toBe(false);
    expect(second.already_completed).toBe(true);
    expect(second.completed_at).toEqual(first.completed_at);
  });

  it("writes one event and leaves the reservation returned", async () => {
    await finalise();
    await finalise();
    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rental_handover_events where handover_id = '${IDS.inHandover}'`,
    );
    expect(events.rows[0].n).toBe(1);
    const res = await db.query<{ status: string }>(
      `select status from public.reservations where id = '${IDS.reservation}'`,
    );
    expect(res.rows[0].status).toBe("returned");
  });

  it("does not move the fleet odometer twice", async () => {
    await finalise();
    await db.exec(`update public.vehicles set odometer_km = 41800 where id = '${IDS.vehicle}';`);
    await finalise();
    const { rows } = await db.query<{ odometer_km: number }>(
      `select odometer_km from public.vehicles where id = '${IDS.vehicle}'`,
    );
    // A retry must not undo a later correction to the fleet record.
    expect(rows[0].odometer_km).toBe(41800);
  });
});

describe("what cannot be completed at all", () => {
  it("refuses an unknown handover", async () => {
    await expect(finalise("ffffffff-0000-4000-8000-00000000dead")).rejects.toThrow(/handover not found/);
  });

  it("refuses a check-out through the check-in path", async () => {
    await expect(finalise(IDS.outHandover)).rejects.toThrow(/is a check-out, not a check-in/);
  });

  it("refuses a voided handover", async () => {
    await db.exec(
      `update public.rental_handovers set status = 'voided', void_reason = 'wrong car' where id = '${IDS.inHandover}';`,
    );
    await expect(finalise()).rejects.toThrow(/was voided and cannot be completed/);
  });

  it("refuses an actor the caller did not supply", async () => {
    await expect(finalise(IDS.inHandover, null)).rejects.toThrow(/no actor supplied/);
  });
});

describe("the gateway, written but not switched on", () => {
  it("is granted to nobody, per the narrowed OPEN block", async () => {
    for (const role of ["anon", "authenticated", "service_role", "public"]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege($1, 'public.finalise_check_in(uuid, timestamptz)', 'execute') as allowed`,
        [role],
      );
      expect(rows[0].allowed, role).toBe(false);
    }
  });

  it("leaves the implementation callable by service_role and nobody else", async () => {
    const sig = "public.finalise_check_in_impl(uuid, uuid, text, timestamptz)";
    const svc = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('service_role', $1, 'execute') as allowed`, [sig],
    );
    expect(svc.rows[0].allowed).toBe(true);

    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege($1, $2, 'execute') as allowed`, [role, sig],
      );
      expect(rows[0].allowed, role).toBe(false);
    }
  });
});
