import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { SUPABASE_COMPATIBILITY_STUBS } from "../scripts/pgliteSupabaseStubs.mjs";

/**
 * Check-out finalisation, executed rather than read.
 *
 * `docs/RENTAL-SYSTEM-BLUEPRINT.md` §4.2 rule 2 lists what must be true before a
 * car leaves the yard. Every item on that list is a refusal somebody will meet
 * at a counter with a customer waiting, so each one is tested for on its own,
 * and the happy path is tested for last — a suite where only the happy path is
 * covered proves the function runs, not that it guards anything.
 *
 * The whole migration chain is replayed here rather than a hand-built subset.
 * §4.5 records three specifications in this same section that could not have
 * been built; a stub schema is exactly how that survives review, because a stub
 * is written by the same person who writes the thing it is meant to catch.
 */

const root = new URL("../", import.meta.url).pathname;
const migrationsDir = join(root, "supabase/migrations");

const MIGRATIONS = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"));

/** Fixed ids, so a failure message names something recognisable. */
const IDS = {
  staff: "aaaaaaaa-0000-4000-8000-000000000001",
  vehicle: "bbbbbbbb-0000-4000-8000-000000000001",
  customer: "cccccccc-0000-4000-8000-000000000001",
  reservation: "dddddddd-0000-4000-8000-000000000001",
  template: "eeeeeeee-0000-4000-8000-000000000001",
  viewFront: "eeeeeeee-0000-4000-8000-000000000010",
  viewRear: "eeeeeeee-0000-4000-8000-000000000011",
  viewOptional: "eeeeeeee-0000-4000-8000-000000000012",
  handover: "ffffffff-0000-4000-8000-000000000001",
};

/**
 * A rental that is ready to go out, and nothing else.
 *
 * Every test then breaks exactly one thing. Building the *valid* case once and
 * damaging it per test is what makes each failure attributable; a fixture built
 * per test drifts, and then a test passes because its fixture was wrong rather
 * than because the code was right.
 */
const READY = `
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values ('${IDS.staff}', 'maria@anadyon.gr', '{"role":"staff"}', '{"full_name":"Maria"}');

  insert into public.vehicles (id, name, category, pricing_group, plate, status)
  values ('${IDS.vehicle}', 'Picanto', 'car', 'car_a', 'ZAK-1234', 'available');

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
  values ('${IDS.template}', 'car', 1, true);

  insert into public.inspection_template_views (id, template_id, view_code, label, sort_order, required)
  values
    ('${IDS.viewFront}',    '${IDS.template}', 'front', 'Front',  0, true),
    ('${IDS.viewRear}',     '${IDS.template}', 'rear',  'Rear',   1, true),
    ('${IDS.viewOptional}', '${IDS.template}', 'boot',  'Boot',   2, false);

  insert into public.rental_handovers (
    id, reservation_id, vehicle_id, direction, status,
    client_operation_id, inspection_template_id,
    created_by, odometer_km, fuel_eighths, cleanliness
  ) values (
    '${IDS.handover}', '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft',
    gen_random_uuid(), '${IDS.template}',
    '${IDS.staff}', 41200, 8, 'clean'
  );

  insert into public.handover_photos
    (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
  values
    ('${IDS.handover}', '${IDS.template}', '${IDS.viewFront}', 'h1/front.jpg', 'image/jpeg', 120000),
    ('${IDS.handover}', '${IDS.template}', '${IDS.viewRear}',  'h1/rear.jpg',  'image/jpeg', 118000);
`;

let db: PGlite;

beforeEach(async () => {
  // A fresh database per test. Slower than one shared instance, and the only
  // way each test can damage the fixture without the next one inheriting it.
  db = new PGlite();
  await db.exec(SUPABASE_COMPATIBILITY_STUBS);
  for (const migration of MIGRATIONS) await db.exec(migration);
  await db.exec(READY);
});

/** Calls the implementation the way the API route will, actor supplied. */
async function finalise(handoverId = IDS.handover, actor: string | null = IDS.staff) {
  const res = await db.query<{ result: Record<string, unknown> }>(
    `select public.finalise_check_out_impl($1, $2, 'Maria') as result`,
    [handoverId, actor],
  );
  return res.rows[0].result;
}

/** The reasons a refusal listed, or null if it did not refuse. */
async function refusalFor(damage: string): Promise<string | null> {
  await db.exec(damage);
  try {
    await finalise();
    return null;
  } catch (err) {
    return String((err as Error).message);
  }
}

describe("check-out refuses, one reason at a time", () => {
  it("refuses a reservation that is not confirmed", async () => {
    const why = await refusalFor(
      `update public.reservations set status = 'pending' where id = '${IDS.reservation}';`,
    );
    expect(why).toMatch(/reservation is pending, not confirmed/);
  });

  it("refuses a vehicle that is not available", async () => {
    const why = await refusalFor(
      `update public.vehicles set status = 'maintenance' where id = '${IDS.vehicle}';`,
    );
    expect(why).toMatch(/vehicle is marked maintenance/);
  });

  it("refuses an open block, whatever the garage estimated", async () => {
    // The estimate is not an end date. Migration 20260829090000 renamed
    // `ends_on` to `expected_return` because a block that lapses on a third
    // party's promise puts a car still in pieces back on sale with nobody asked
    // — and the first draft of the finalisation function made exactly that
    // mistake. A block with an estimate already in the past is still open.
    const why = await refusalFor(`
      insert into public.vehicle_blocks (vehicle_id, reason, starts_on, expected_return)
      values ('${IDS.vehicle}', 'statutory', current_date - 10, current_date - 5);
    `);
    expect(why).toMatch(/open block covering this rental/);
  });

  it("refuses a block that starts mid-rental", async () => {
    // The car is free today and booked into the garage on Wednesday. Releasing
    // it for a rental that runs past Wednesday is the same failure one day later.
    const why = await refusalFor(`
      insert into public.vehicle_blocks (vehicle_id, reason, starts_on)
      values ('${IDS.vehicle}', 'maintenance', current_date + 1);
    `);
    expect(why).toMatch(/open block covering this rental/);
  });

  it("allows a block that a person released", async () => {
    // The mirror of the two above. Without it, "blocked" could be implemented as
    // "any block row exists" and both would still pass.
    await db.exec(`
      insert into public.vehicle_blocks (vehicle_id, reason, starts_on, released_at)
      values ('${IDS.vehicle}', 'maintenance', current_date - 30, now());
    `);
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "active" });
  });

  it("allows a block that starts after the rental has ended", async () => {
    await db.exec(`
      insert into public.vehicle_blocks (vehicle_id, reason, starts_on)
      values ('${IDS.vehicle}', 'maintenance', current_date + 30);
    `);
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "active" });
  });

  it("refuses an expired KTEO", async () => {
    const why = await refusalFor(
      `update public.vehicles set kteo_expiry = current_date - 1 where id = '${IDS.vehicle}';`,
    );
    expect(why).toMatch(/KTEO expired on/);
  });

  it("refuses expired insurance", async () => {
    const why = await refusalFor(
      `update public.vehicles set insurance_expiry = current_date - 1 where id = '${IDS.vehicle}';`,
    );
    expect(why).toMatch(/insurance expired on/);
  });

  it("treats an unrecorded statutory date as unrecorded, not as expired", async () => {
    // Mirrors rentalBar() in lib/fleetStatus.ts and the allocator. A stricter
    // rule here would make a car the system allocated impossible to release.
    await db.exec(
      `update public.vehicles set kteo_expiry = null, insurance_expiry = null where id = '${IDS.vehicle}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "active" });
  });

  it("refuses an expired driving licence", async () => {
    const why = await refusalFor(
      `update public.customers set driving_licence_expiry = current_date - 1 where id = '${IDS.customer}';`,
    );
    expect(why).toMatch(/driving licence expired on/);
  });

  it("refuses a missing licence expiry rather than assuming it is fine", async () => {
    const why = await refusalFor(
      `update public.customers set driving_licence_expiry = null where id = '${IDS.customer}';`,
    );
    expect(why).toMatch(/no driving licence expiry is recorded/);
  });

  it("refuses an unsigned rental agreement", async () => {
    const why = await refusalFor(
      `update public.reservations set agreement_signed_at = null where id = '${IDS.reservation}';`,
    );
    expect(why).toMatch(/agreement is not recorded as signed/);
  });

  it("refuses when cleanliness was not recorded", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set cleanliness = null where id = '${IDS.handover}';`,
    );
    expect(why).toMatch(/cleanliness was not recorded/);
  });

  it("refuses poor cleanliness with no note saying why", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set cleanliness = 'poor', notes = '   ' where id = '${IDS.handover}';`,
    );
    expect(why).toMatch(/cleanliness is poor, which requires a note/);
  });

  it("accepts poor cleanliness once a note explains it", async () => {
    await db.exec(
      `update public.rental_handovers set cleanliness = 'poor', notes = 'Sand throughout, photographed' where id = '${IDS.handover}';`,
    );
    await expect(finalise()).resolves.toMatchObject({ already_completed: false });
  });

  it("refuses a missing required photograph", async () => {
    const why = await refusalFor(
      `delete from public.handover_photos where template_view_id = '${IDS.viewRear}';`,
    );
    expect(why).toMatch(/1 required photograph\(s\) are missing/);
  });

  it("does not require the optional views", async () => {
    // The 'boot' view is required = false. If the count ignored that flag, this
    // rental could never leave.
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "active" });
  });

  it("refuses a car with no odometer reading", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set odometer_km = null where id = '${IDS.handover}';`,
    );
    expect(why).toMatch(/odometer reading is required/);
  });

  it("refuses a car with no fuel level", async () => {
    const why = await refusalFor(
      `update public.rental_handovers set fuel_eighths = null where id = '${IDS.handover}';`,
    );
    expect(why).toMatch(/fuel level is required/);
  });

  it("requires neither instrument on a bicycle", async () => {
    // §4.2: "Do not write invented zero readings to satisfy a form." A bicycle
    // has no odometer and no fuel gauge, and a rule that demanded them would be
    // answered with fabricated data rather than obeyed.
    await db.exec(`
      update public.vehicles set category = 'bike', pricing_group = 'bike' where id = '${IDS.vehicle}';
      update public.inspection_templates set vehicle_category = 'bike' where id = '${IDS.template}';
      update public.rental_handovers set odometer_km = null, fuel_eighths = null where id = '${IDS.handover}';
    `);
    await expect(finalise()).resolves.toMatchObject({ reservation_status: "active" });
  });

  it("refuses a handover whose vehicle is not the reservation's", async () => {
    // Reallocation after the draft was started. The handover records the unit
    // physically presented; if they have diverged, one of them is wrong and
    // guessing which is not the database's job.
    const why = await refusalFor(`
      insert into public.vehicles (id, name, category, pricing_group, status)
      values ('bbbbbbbb-0000-4000-8000-000000000002', 'Aygo', 'car', 'car_a', 'available');
      update public.reservations set vehicle_id = 'bbbbbbbb-0000-4000-8000-000000000002'
       where id = '${IDS.reservation}';
    `);
    expect(why).toMatch(/different vehicle from the reservation/);
  });
});

describe("check-out reports every reason at once", () => {
  it("lists all of them, because staff are standing next to the car", async () => {
    // Three round trips to discover three problems is three conversations with
    // a waiting customer. This is the behaviour that makes the refusal usable
    // rather than merely correct.
    const why = await refusalFor(`
      update public.reservations set agreement_signed_at = null where id = '${IDS.reservation}';
      update public.vehicles set status = 'maintenance' where id = '${IDS.vehicle}';
      update public.rental_handovers set cleanliness = null where id = '${IDS.handover}';
    `);
    expect(why).toMatch(/vehicle is marked maintenance/);
    expect(why).toMatch(/agreement is not recorded as signed/);
    expect(why).toMatch(/cleanliness was not recorded/);
  });
});

describe("check-out completes", () => {
  it("moves the reservation to active and stamps the handover", async () => {
    const result = await finalise();
    expect(result).toMatchObject({
      reservation_id: IDS.reservation,
      reservation_status: "active",
      already_completed: false,
    });

    const { rows } = await db.query<{
      status: string; completed_by: string; staff_name_snapshot: string;
      completed_at: string; occurred_at: string;
    }>(`select status, completed_by, staff_name_snapshot, completed_at, occurred_at
          from public.rental_handovers where id = '${IDS.handover}'`);

    expect(rows[0].status).toBe("completed");
    expect(rows[0].completed_by).toBe(IDS.staff);
    expect(rows[0].staff_name_snapshot).toBe("Maria");
    expect(rows[0].completed_at).not.toBeNull();
    // occurred_at defaults to the completion time when the tablet did not say
    // otherwise, rather than being left null on a completed record.
    expect(rows[0].occurred_at).not.toBeNull();
  });

  it("writes one audit event carrying before and after state", async () => {
    await finalise();
    const { rows } = await db.query<{
      event_type: string; actor_user_id: string;
      before_state: Record<string, unknown>; after_state: Record<string, unknown>;
    }>(`select event_type, actor_user_id, before_state, after_state
          from public.rental_handover_events where handover_id = '${IDS.handover}'`);

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("completed");
    expect(rows[0].actor_user_id).toBe(IDS.staff);
    expect(rows[0].before_state.status).toBe("draft");
    expect(rows[0].after_state.status).toBe("completed");
    expect(rows[0].after_state.reservation_status).toBe("active");
  });

  it("records how far behind completion the stated occurrence was", async () => {
    // §4.2: "device time alone is not legal evidence" — the gap between what
    // staff say happened and when the server recorded it has to be visible
    // rather than reconstructed from two timestamps years later.
    const res = await db.query<{ result: Record<string, unknown> }>(
      `select public.finalise_check_out_impl($1, $2, 'Maria', now() - interval '45 minutes') as result`,
      [IDS.handover, IDS.staff],
    );
    expect(res.rows[0].result.already_completed).toBe(false);

    const { rows } = await db.query<{ after_state: Record<string, number> }>(
      `select after_state from public.rental_handover_events where handover_id = '${IDS.handover}'`,
    );
    expect(Number(rows[0].after_state.occurred_before_completion_seconds)).toBeGreaterThan(2600);
  });

  it("refuses an actor the caller did not supply", async () => {
    await expect(finalise(IDS.handover, null)).rejects.toThrow(/no actor supplied/);
  });
});

describe("a tablet that submits twice", () => {
  it("returns the same completed handover instead of failing", async () => {
    // A dropped connection and a second tap. Answering "the reservation is
    // already active" would report a failure for a rental that went perfectly.
    const first = await finalise();
    const second = await finalise();

    expect(first.already_completed).toBe(false);
    expect(second.already_completed).toBe(true);
    expect(second.handover_id).toBe(first.handover_id);
    expect(second.completed_at).toEqual(first.completed_at);
  });

  it("writes no second audit event and does not re-transition the reservation", async () => {
    await finalise();
    await finalise();

    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rental_handover_events where handover_id = '${IDS.handover}'`,
    );
    expect(events.rows[0].n).toBe(1);

    const res = await db.query<{ status: string }>(
      `select status from public.reservations where id = '${IDS.reservation}'`,
    );
    expect(res.rows[0].status).toBe("active");
  });

  it("does not re-run validation against the now-active rental", async () => {
    // The reason idempotency is checked before the preconditions: by the second
    // submit the reservation is 'active', which the first rule would reject. A
    // retry must not be refused for the consequence of its own success.
    await finalise();
    await expect(finalise()).resolves.toMatchObject({ already_completed: true });
  });
});

describe("what cannot be completed at all", () => {
  it("refuses an unknown handover", async () => {
    await expect(finalise("ffffffff-0000-4000-8000-00000000dead")).rejects.toThrow(/handover not found/);
  });

  it("refuses a check-in through the check-out path", async () => {
    await db.exec(
      `update public.rental_handovers set direction = 'in' where id = '${IDS.handover}';`,
    );
    await expect(finalise()).rejects.toThrow(/is a check-in, not a check-out/);
  });

  it("refuses a voided handover", async () => {
    await db.exec(
      `update public.rental_handovers set status = 'voided', void_reason = 'started on the wrong car' where id = '${IDS.handover}';`,
    );
    await expect(finalise()).rejects.toThrow(/was voided and cannot be completed/);
  });

  /**
   * **Not covered here: two finalisations racing.**
   *
   * §4.2's acceptance gate asks for it and this file cannot supply it. PGlite is
   * a single connection, so there is no second session to race with; a test
   * shaped like one would be two sequential calls wearing a costume, and that is
   * the class of reproduction `AGENTS.md` says must be able to reproduce.
   *
   * What does hold without depending on timing is structural: the partial unique
   * index `rental_handovers_one_live_per_direction` permits one non-voided
   * handover per reservation and direction, so a second *handover* cannot exist
   * to be finalised. The row locks taken in a fixed order serialise two attempts
   * at the *same* handover, and the idempotency branch above is then what the
   * loser meets. The race belongs in the hosted staging suite, against a real
   * Postgres with two connections.
   */
  it("permits only one live out handover per reservation, whatever the timing", async () => {
    await expect(db.exec(`
      insert into public.rental_handovers (
        reservation_id, vehicle_id, direction, status, client_operation_id, inspection_template_id
      ) values (
        '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft', gen_random_uuid(), '${IDS.template}'
      );
    `)).rejects.toThrow(/rental_handovers_one_live_per_direction|duplicate key/);
  });
});

describe("the gateway, which is written but not switched on", () => {
  it("exists", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname = 'finalise_check_out'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("is granted to nobody, per the narrowed OPEN block", async () => {
    // docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4: no gateway gets EXECUTE in
    // production until diagnostic 10c has run. A grant added here by accident —
    // or by a well-meaning later edit — is the thing this test exists to catch.
    for (const role of ["anon", "authenticated", "service_role", "public"]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege($1, 'public.finalise_check_out(uuid, timestamptz)', 'execute') as allowed`,
        [role],
      );
      expect(rows[0].allowed, role).toBe(false);
    }
  });

  it("leaves the implementation callable by service_role, which is the interim path", async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('service_role',
         'public.finalise_check_out_impl(uuid, uuid, text, timestamptz)', 'execute') as allowed`,
    );
    expect(rows[0].allowed).toBe(true);
  });

  it("keeps the implementation away from anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege($1,
           'public.finalise_check_out_impl(uuid, uuid, text, timestamptz)', 'execute') as allowed`,
        [role],
      );
      expect(rows[0].allowed, role).toBe(false);
    }
  });
});
