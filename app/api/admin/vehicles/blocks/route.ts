import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Taking a vehicle out of the active fleet, and putting it back.
 *
 * Blueprint §7.4. Staff-accessible by inheritance: proxy.ts lists
 * `/api/admin/vehicles` in STAFF_API and matches sub-paths, which is right —
 * a car going into the workshop is operational, and a release that only an
 * admin can perform is a release that waits.
 *
 * The rule this route exists to hold: **an expected return ends nothing.** A
 * block is closed by a person, through PATCH, and never by a date arriving.
 */

const REASONS = ["maintenance", "statutory", "damage", "hold", "other"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function statusForPgError(code?: string): number {
  if (code === "23505") return 409;
  if (code === "23503" || code === "23514") return 400;
  return 500;
}

/**
 * The staff member acting, from their own session rather than the service role.
 *
 * Same pattern as app/api/admin/users/route.ts. It is the application's claim
 * about who acted, not a database-verified identity — under the service role
 * `auth.uid()` is NULL, which is the open question in
 * docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md. Recorded as such.
 */
async function actorId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** GET /api/admin/vehicles/blocks?vehicle_id=&open=1 */
export async function GET(req: NextRequest) {
  // new URL(req.url) rather than req.nextUrl: the same thing at runtime, and
  // it is present when the route is exercised directly by a test. Matches
  // ../availability/route.ts.
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicle_id");
  const openOnly = searchParams.get("open") === "1";

  let query = supabaseAdmin
    .from("vehicle_blocks")
    .select("id, vehicle_id, reason, starts_on, expected_return, note, created_at, released_at, vehicles(name, plate)")
    .order("starts_on", { ascending: false });

  if (vehicleId) query = query.eq("vehicle_id", vehicleId);
  if (openOnly) query = query.is("released_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST — take a vehicle out.
 *
 * Responds with the reservations the block now covers. A block stops NEW
 * allocation; it does not touch bookings already on the vehicle, and those sit
 * quietly until the customer arrives. Surfacing them here means the decision to
 * move or call them is made on the day the car goes in, not the day it bites.
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  const startsOn = typeof body.starts_on === "string" ? body.starts_on : "";
  const expectedReturn = typeof body.expected_return === "string" && body.expected_return
    ? body.expected_return : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!vehicleId) return NextResponse.json({ error: "Choose a vehicle." }, { status: 400 });
  if (!REASONS.includes(reason as (typeof REASONS)[number])) {
    return NextResponse.json({ error: `Reason must be one of: ${REASONS.join(", ")}.` }, { status: 400 });
  }
  if (!ISO_DATE.test(startsOn)) {
    return NextResponse.json({ error: "Give the date the vehicle went out." }, { status: 400 });
  }
  if (expectedReturn && !ISO_DATE.test(expectedReturn)) {
    return NextResponse.json({ error: "The expected return is not a valid date." }, { status: 400 });
  }
  if (expectedReturn && expectedReturn < startsOn) {
    return NextResponse.json({ error: "The expected return cannot precede the day it went out." }, { status: 400 });
  }

  const { data: block, error } = await supabaseAdmin
    .from("vehicle_blocks")
    .insert({
      vehicle_id: vehicleId, reason, starts_on: startsOn,
      expected_return: expectedReturn, note, created_by: await actorId(),
    })
    .select("id, vehicle_id, reason, starts_on, expected_return, note, created_at, released_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });

  // Anything still running or still to come on this vehicle. A rental that
  // finished before the block began is not affected and is not listed.
  const { data: covered } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, customer_phone, pickup_date, pickup_time, return_date, status")
    .eq("vehicle_id", vehicleId)
    .not("status", "in", '("cancelled","voided","no_show")')
    .gte("return_date", startsOn)
    .order("pickup_date");

  return NextResponse.json({ block, covered_reservations: covered ?? [] }, { status: 201 });
}

/**
 * PATCH — record the vehicle back in the fleet.
 *
 * The only thing that ends a block. Deliberately separate from an edit: putting
 * a car back is a statement about the physical world, and it is attributed.
 */
export async function PATCH(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const id = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).id === "string"
    ? (raw as Record<string, string>).id : "";
  if (!id) return NextResponse.json({ error: "Which block?" }, { status: 400 });

  const { data: existing, error: readError } = await supabaseAdmin
    .from("vehicle_blocks")
    .select("id, released_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "That block no longer exists." }, { status: 404 });
  if (existing.released_at) {
    // Not an error worth failing on — two people pressing the same button is
    // the expected way this gets used.
    return NextResponse.json({ block: existing, already_released: true });
  }

  const { data, error } = await supabaseAdmin
    .from("vehicle_blocks")
    .update({ released_at: new Date().toISOString(), released_by: await actorId() })
    .eq("id", id)
    .is("released_at", null)
    .select("id, vehicle_id, reason, starts_on, expected_return, note, released_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });
  return NextResponse.json({ block: data });
}

/**
 * DELETE — cancel a block that never took effect.
 *
 * Only while it is still in the future. A vehicle that has actually been out is
 * released, not erased: deleting it would remove the record of the car having
 * been off the road, which is the one thing this table exists to keep. It is
 * also exactly how a hard stop gets worked around, so the door is shut here
 * rather than relying on nobody trying it.
 */
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which block?" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("vehicle_blocks")
    .select("id, starts_on, released_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "That block no longer exists." }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  if (existing.starts_on <= today) {
    return NextResponse.json({
      error: "This vehicle has already been out. Record it back in the fleet instead of deleting the block.",
    }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("vehicle_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
