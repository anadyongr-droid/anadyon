import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { SUPABASE_COMPATIBILITY_STUBS } from "../scripts/pgliteSupabaseStubs.mjs";

/**
 * Correcting and voiding a completed handover — §4.2 rule 4, executed.
 *
 * The fixture runs a real check-out *and* a real check-in, so what is corrected
 * and voided here is state the system produced rather than rows arranged to
 * look like it. That matters more for this migration than for the two before
 * it, because most of what it does is undo their work, and undoing a fabricated
 * state proves nothing about undoing a real one.
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
  customer: "cccccccc-0000-4000-8000-000000000001",
  reservation: "dddddddd-0000-4000-8000-000000000001",
  template: "eeeeeeee-0000-4000-8000-000000000001",
  viewFront: "eeeeeeee-0000-4000-8000-000000000010",
  viewRear: "eeeeeeee-0000-4000-8000-000000000011",
  out: "ffffffff-0000-4000-8000-000000000001",
  in: "ffffffff-0000-4000-8000-000000000002",
};

const FIXTURE = `
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values ('${IDS.staff}', 'maria@anadyon.gr', '{"role":"staff"}', '{"full_name":"Maria"}');

  insert into public.vehicles (id, name, category, pricing_group, plate, status, odometer_km)
  values ('${IDS.vehicle}', 'Picanto', 'car', 'car_a', 'ZAK-1234', 'available', 41200);

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
    3, 40, 120, 120, 40, 80, 'confirmed', now()
  );

  insert into public.inspection_templates (id, vehicle_category, version, active)
  values ('${IDS.template}', 'car', 1, true);

  insert into public.inspection_template_views (id, template_id, view_code, label, sort_order, required)
  values ('${IDS.viewFront}', '${IDS.template}', 'front', 'Front', 0, true),
         ('${IDS.viewRear}',  '${IDS.template}', 'rear',  'Rear',  1, true);

  insert into public.rental_handovers (
    id, reservation_id, vehicle_id, direction, status,
    client_operation_id, inspection_template_id, created_by,
    odometer_km, fuel_eighths, cleanliness
  ) values
    ('${IDS.out}', '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft',
     gen_random_uuid(), '${IDS.template}', '${IDS.staff}', 41200, 8, 'clean'),
    ('${IDS.in}',  '${IDS.reservation}', '${IDS.vehicle}', 'in',  'draft',
     gen_random_uuid(), '${IDS.template}', '${IDS.staff}', 41500, 5, 'acceptable');

  insert into public.handover_photos
    (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
  values
    ('${IDS.out}', '${IDS.template}', '${IDS.viewFront}', 'out/f.jpg', 'image/jpeg', 1000),
    ('${IDS.out}', '${IDS.template}', '${IDS.viewRear}',  'out/r.jpg', 'image/jpeg', 1000),
    ('${IDS.in}',  '${IDS.template}', '${IDS.viewFront}', 'in/f.jpg',  'image/jpeg', 1000),
    ('${IDS.in}',  '${IDS.template}', '${IDS.viewRear}',  'in/r.jpg',  'image/jpeg', 1000);
`;

let db: PGlite;

/** Runs both finalisations, so the rows under test were produced, not written. */
async function completeBoth() {
  await db.query(`select public.finalise_check_out_impl($1, $2, 'Maria')`, [IDS.out, IDS.staff]);
  await db.query(`select public.finalise_check_in_impl($1, $2, 'Maria')`, [IDS.in, IDS.staff]);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_COMPATIBILITY_STUBS);
  for (const migration of MIGRATIONS) await db.exec(migration);
  await db.exec(FIXTURE);
});

async function correct(handover: string, reason: string, changes: Record<string, unknown>) {
  const res = await db.query<{ result: Record<string, unknown> }>(
    `select public.correct_handover_impl($1, $2, 'Maria', $3, $4::jsonb) as result`,
    [handover, IDS.staff, reason, JSON.stringify(changes)],
  );
  return res.rows[0].result;
}

async function voidIt(handover: string, reason: string) {
  const res = await db.query<{ result: Record<string, unknown> }>(
    `select public.void_handover_impl($1, $2, 'Maria', $3) as result`,
    [handover, IDS.staff, reason],
  );
  return res.rows[0].result;
}

const handoverRow = async (id: string) =>
  (await db.query<{
    status: string; completed_at: string | null; odometer_km: number | null;
    fuel_eighths: number | null; cleanliness: string | null; void_reason: string | null;
  }>(`select status, completed_at, odometer_km, fuel_eighths, cleanliness, void_reason
        from public.rental_handovers where id = '${id}'`)).rows[0];

const reservationStatus = async () =>
  (await db.query<{ status: string }>(
    `select status from public.reservations where id = '${IDS.reservation}'`)).rows[0].status;

describe("a correction needs a reason and a change", () => {
  beforeEach(completeBoth);

  it("refuses a blank reason", async () => {
    // §4.2 requires a reason, and this is the field a later dispute reads first.
    await expect(correct(IDS.in, "   ", { odometer_km: 41600 }))
      .rejects.toThrow(/a correction requires a reason/);
  });

  it("refuses an empty change set", async () => {
    await expect(correct(IDS.in, "typo", {}))
      .rejects.toThrow(/must change something/);
  });

  it("refuses a field that is not an observation, and names it", async () => {
    // Silently dropping vehicle_id would let a caller believe they changed it.
    await expect(correct(IDS.in, "wrong car", { vehicle_id: IDS.vehicle, odometer_km: 41600 }))
      .rejects.toThrow(/these fields cannot be corrected: vehicle_id/);
  });

  it("points at voiding as the way to change what the record is about", async () => {
    await expect(correct(IDS.in, "wrong booking", { reservation_id: IDS.reservation }))
      .rejects.toThrow(/void it and record a new one/);
  });

  it("refuses to correct a draft, which should just be edited", async () => {
    // On a second reservation: `rental_handovers_one_live_per_direction`
    // permits one non-voided handover per reservation and direction, so the
    // completed check-out already occupies that slot. The index refusing a
    // second live draft is the schema working, and it caught the first version
    // of this test rather than the code.
    await db.exec(`
      insert into public.reservations (
        id, vehicle_id, customer_id, customer_name,
        pickup_date, pickup_time, return_date, return_time,
        rental_days, daily_rate, vehicle_subtotal, total, deposit, balance_due,
        status, agreement_signed_at
      ) values (
        'dddddddd-0000-4000-8000-000000000002', '${IDS.vehicle}', '${IDS.customer}',
        'Alex Papadopoulos', current_date + 10, '09:00', current_date + 12, '09:00',
        2, 40, 80, 80, 40, 40, 'confirmed', now()
      );
      insert into public.rental_handovers (
        id, reservation_id, vehicle_id, direction, status,
        client_operation_id, inspection_template_id, created_by
      ) values (
        'ffffffff-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000002',
        '${IDS.vehicle}', 'out', 'draft', gen_random_uuid(), '${IDS.template}', '${IDS.staff}'
      );
    `);
    await expect(correct("ffffffff-0000-4000-8000-00000000000a", "typo", { odometer_km: 1 }))
      .rejects.toThrow(/still a draft; edit it rather than correcting it/);
  });

  it("refuses to correct a voided handover", async () => {
    await voidIt(IDS.in, "wrong car");
    await expect(correct(IDS.in, "typo", { odometer_km: 41600 }))
      .rejects.toThrow(/was voided; correct the handover that replaced it/);
  });
});

describe("a correction cannot reach a state finalisation would have refused", () => {
  beforeEach(completeBoth);

  it("refuses lowering the check-in odometer below the check-out reading", async () => {
    await expect(correct(IDS.in, "misread", { odometer_km: 41100 }))
      .rejects.toThrow(/lower than the 41200 recorded at check-out/);
  });

  it("refuses raising the check-out odometer above the check-in reading", async () => {
    // Only reachable through a correction — check-out has no in handover to
    // compare against when it runs, so this direction was previously unguarded.
    await expect(correct(IDS.out, "misread", { odometer_km: 41600 }))
      .rejects.toThrow(/higher than the 41500 recorded at check-in/);
  });

  it("refuses clearing cleanliness", async () => {
    await expect(correct(IDS.in, "not sure", { cleanliness: null }))
      .rejects.toThrow(/cleanliness was not recorded/);
  });

  it("refuses poor cleanliness without a note, and accepts it with one", async () => {
    await expect(correct(IDS.in, "on reflection", { cleanliness: "poor" }))
      .rejects.toThrow(/requires a note saying why/);

    await expect(correct(IDS.in, "on reflection", {
      cleanliness: "poor", notes: "Sand throughout the footwells",
    })).resolves.toBeTruthy();
  });

  it("refuses an occurrence in the future", async () => {
    await expect(correct(IDS.in, "clock was wrong", {
      occurred_at: new Date(Date.now() + 86_400_000).toISOString(),
    })).rejects.toThrow(/cannot have occurred in the future/);
  });

  it("leaves the row untouched when it refuses", async () => {
    // The function updates and then validates, so the refusal has to roll the
    // update back. If it did not, a rejected correction would still have
    // changed the record — the worst of both outcomes.
    const before = await handoverRow(IDS.in);
    await expect(correct(IDS.in, "misread", { odometer_km: 41100 })).rejects.toThrow();
    expect(await handoverRow(IDS.in)).toEqual(before);
  });
});

describe("a correction that goes through", () => {
  beforeEach(completeBoth);

  it("changes only the fields named, and leaves the rest", async () => {
    const result = await correct(IDS.in, "odometer misread in the sun", { odometer_km: 41550 });
    expect(result.corrected_fields).toEqual(["odometer_km"]);

    const row = await handoverRow(IDS.in);
    expect(row.odometer_km).toBe(41550);
    expect(row.fuel_eighths).toBe(5);
    expect(row.cleanliness).toBe("acceptable");
    expect(row.status).toBe("completed");
  });

  it("writes a corrected event carrying the reason and both states", async () => {
    await correct(IDS.in, "odometer misread in the sun", { odometer_km: 41550 });
    const { rows } = await db.query<{
      event_type: string; reason: string;
      before_state: Record<string, unknown>; after_state: Record<string, unknown>;
    }>(`select event_type, reason, before_state, after_state
          from public.rental_handover_events
         where handover_id = '${IDS.in}' and event_type = 'corrected'`);

    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("odometer misread in the sun");
    expect(rows[0].before_state.odometer_km).toBe(41500);
    expect(rows[0].after_state.odometer_km).toBe(41550);
    expect(rows[0].after_state.corrected_fields).toEqual(["odometer_km"]);
  });

  it("moves the fleet odometer with a corrected check-in reading", async () => {
    await correct(IDS.in, "misread", { odometer_km: 41550 });
    const { rows } = await db.query<{ odometer_km: number }>(
      `select odometer_km from public.vehicles where id = '${IDS.vehicle}'`);
    expect(rows[0].odometer_km).toBe(41550);
  });

  it("leaves the fleet odometer alone when something else has moved it since", async () => {
    // A person or another process set it deliberately. A correction to an old
    // rental has no business overriding that, and the guard is what makes the
    // update above safe to do at all.
    await db.exec(`update public.vehicles set odometer_km = 42000 where id = '${IDS.vehicle}';`);
    await correct(IDS.in, "misread", { odometer_km: 41550 });
    const { rows } = await db.query<{ odometer_km: number }>(
      `select odometer_km from public.vehicles where id = '${IDS.vehicle}'`);
    expect(rows[0].odometer_km).toBe(42000);
  });

  it("requires an actor", async () => {
    await expect(
      db.query(`select public.correct_handover_impl($1, null, 'Maria', 'typo', '{"odometer_km":41550}'::jsonb)`,
        [IDS.in]),
    ).rejects.toThrow(/no actor supplied/);
  });
});

describe("voiding", () => {
  it("requires a reason", async () => {
    await completeBoth();
    await expect(voidIt(IDS.in, "  ")).rejects.toThrow(/voiding requires a reason/);
  });

  it("clears completed_at, because the constraint forbids keeping it", async () => {
    // rental_handovers_completed_together asserts
    // (status = 'completed') = (completed_at is not null). The obvious one-line
    // void does not clear it and the row is rejected. This migration is written
    // to that constraint rather than discovering it in production.
    await completeBoth();
    await voidIt(IDS.in, "wrong car on the form");
    const row = await handoverRow(IDS.in);
    expect(row.status).toBe("voided");
    expect(row.completed_at).toBeNull();
    expect(row.void_reason).toBe("wrong car on the form");
  });

  it("steps a voided check-in back from returned to active", async () => {
    await completeBoth();
    const result = await voidIt(IDS.in, "wrong car");
    expect(result.reservation_stepped_back_to).toBe("active");
    expect(await reservationStatus()).toBe("active");
  });

  it("steps a voided check-out back from active to confirmed", async () => {
    await db.query(`select public.finalise_check_out_impl($1, $2, 'Maria')`, [IDS.out, IDS.staff]);
    const result = await voidIt(IDS.out, "started on the wrong car");
    expect(result.reservation_stepped_back_to).toBe("confirmed");
    expect(await reservationStatus()).toBe("confirmed");
  });

  it("does not drag a reservation back from a status this handover did not set", async () => {
    // Somebody cancelled the booking after the fact. A void undoes its own
    // effect; it does not rewind whatever happened next.
    await completeBoth();
    await db.exec(`update public.reservations set status = 'cancelled' where id = '${IDS.reservation}';`);
    const result = await voidIt(IDS.in, "wrong car");
    expect(result.reservation_stepped_back_to).toBeNull();
    expect(await reservationStatus()).toBe("cancelled");
  });

  it("leaves the reservation alone when voiding a draft", async () => {
    // A draft never moved it.
    const result = await voidIt(IDS.out, "opened against the wrong booking");
    expect(result.reservation_stepped_back_to).toBeNull();
    expect(await reservationStatus()).toBe("confirmed");
  });

  it("is idempotent on a second submit", async () => {
    await completeBoth();
    const first = await voidIt(IDS.in, "wrong car");
    const second = await voidIt(IDS.in, "wrong car");
    expect(first.already_voided).toBe(false);
    expect(second.already_voided).toBe(true);

    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rental_handover_events
        where handover_id = '${IDS.in}' and event_type = 'voided'`);
    expect(events.rows[0].n).toBe(1);
  });

  it("writes a voided event carrying the reason and the step back", async () => {
    await completeBoth();
    await voidIt(IDS.in, "wrong car on the form");
    const { rows } = await db.query<{
      reason: string; before_state: Record<string, unknown>; after_state: Record<string, unknown>;
    }>(`select reason, before_state, after_state from public.rental_handover_events
         where handover_id = '${IDS.in}' and event_type = 'voided'`);

    expect(rows[0].reason).toBe("wrong car on the form");
    expect(rows[0].before_state.status).toBe("completed");
    expect(rows[0].after_state.status).toBe("voided");
    expect(rows[0].after_state.reservation_stepped_back_to).toBe("active");
  });
});

describe("the point of the step back: a replacement can be finalised", () => {
  it("lets a corrected check-out be recorded and completed after voiding the wrong one", async () => {
    // This is the whole reason voiding touches the reservation at all. Without
    // it the replacement would be refused for the state its own voided
    // predecessor left behind, and the correction path would exist and not work.
    await db.query(`select public.finalise_check_out_impl($1, $2, 'Maria')`, [IDS.out, IDS.staff]);
    await voidIt(IDS.out, "started on the wrong car");

    const replacement = "ffffffff-0000-4000-8000-00000000000b";
    await db.exec(`
      insert into public.rental_handovers (
        id, reservation_id, vehicle_id, direction, status,
        client_operation_id, inspection_template_id, created_by,
        odometer_km, fuel_eighths, cleanliness
      ) values (
        '${replacement}', '${IDS.reservation}', '${IDS.vehicle}', 'out', 'draft',
        gen_random_uuid(), '${IDS.template}', '${IDS.staff}', 41205, 8, 'clean'
      );
      insert into public.handover_photos
        (handover_id, inspection_template_id, template_view_id, object_path, mime_type, byte_size)
      values
        ('${replacement}', '${IDS.template}', '${IDS.viewFront}', 'rep/f.jpg', 'image/jpeg', 1000),
        ('${replacement}', '${IDS.template}', '${IDS.viewRear}',  'rep/r.jpg', 'image/jpeg', 1000);
    `);

    const res = await db.query<{ result: Record<string, unknown> }>(
      `select public.finalise_check_out_impl($1, $2, 'Maria') as result`, [replacement, IDS.staff]);
    expect(res.rows[0].result).toMatchObject({ reservation_status: "active" });
  });
});

describe("the gateways, written but not switched on", () => {
  it("grants neither to anybody", async () => {
    for (const sig of ["public.correct_handover(uuid, text, jsonb)", "public.void_handover(uuid, text)"]) {
      for (const role of ["anon", "authenticated", "service_role", "public"]) {
        const { rows } = await db.query<{ allowed: boolean }>(
          `select has_function_privilege($1, $2, 'execute') as allowed`, [role, sig]);
        expect(rows[0].allowed, `${role} on ${sig}`).toBe(false);
      }
    }
  });

  it("reserves correction to an administrator and leaves voiding with staff", async () => {
    // Asserted from the source, because the gateways cannot be executed until
    // 10c: a void is a counter mistake and its fix has to be available at the
    // counter, while a correction rewrites an observation in place.
    const sql = readFileSync(
      join(migrationsDir, "20260901140000_handover_correction_and_void.sql"), "utf8");
    const corrector = sql.slice(sql.indexOf("function public.correct_handover("));
    expect(corrector.slice(0, corrector.indexOf("$$;"))).toMatch(/requires an administrator/);
    const voider = sql.slice(sql.indexOf("function public.void_handover("));
    expect(voider.slice(0, voider.indexOf("$$;"))).toMatch(/in \('admin', 'staff'\)/);
  });

  it("leaves both implementations callable by service_role only", async () => {
    const sigs = [
      "public.correct_handover_impl(uuid, uuid, text, text, jsonb)",
      "public.void_handover_impl(uuid, uuid, text, text)",
    ];
    for (const sig of sigs) {
      const svc = await db.query<{ allowed: boolean }>(
        `select has_function_privilege('service_role', $1, 'execute') as allowed`, [sig]);
      expect(svc.rows[0].allowed, sig).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query<{ allowed: boolean }>(
          `select has_function_privilege($1, $2, 'execute') as allowed`, [role, sig]);
        expect(rows[0].allowed, `${role} on ${sig}`).toBe(false);
      }
    }
  });
});
