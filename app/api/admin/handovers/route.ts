import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";

/**
 * The counter: listing a rental's handovers, and opening one.
 *
 * Blueprint §4.2. Migrations 040–043 hold the rules; these routes carry a
 * tablet's request to them and its answer back, and deliberately decide as
 * little as possible themselves. Anything this file validated *instead of* the
 * database would be a second copy of a rule, and the copies drift.
 *
 * Staff-accessible by inheritance: proxy.ts lists `/api/admin/handovers` in
 * STAFF_API and matches sub-paths. That is right — this is the work of a rental
 * and there is nothing financial on it. The one sub-path that is *not* staff
 * work, `/correct`, refuses at the point of use, exactly as the vehicle ledger
 * does under `/api/admin/vehicles`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The staff member acting, from their own session rather than the service role.
 *
 * The same pattern as `/api/admin/vehicles/blocks`, and the same caveat: this
 * is the application's claim about who acted, not a database-verified identity,
 * because under the service role `auth.uid()` is NULL. The gateways in 041–043
 * are the fix and are granted to nobody until diagnostic 10c —
 * docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4.
 */
export async function actorId(): Promise<string | null> {
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

/** The display name stored alongside the actor, so a later rename cannot erase it. */
export async function actorName(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const full = typeof meta?.full_name === "string" ? meta.full_name : null;
    return full ?? user?.email ?? null;
  } catch {
    return null;
  }
}

const HANDOVER_COLUMNS =
  "id, reservation_id, vehicle_id, direction, status, client_operation_id, " +
  "inspection_template_id, created_by, completed_by, staff_name_snapshot, " +
  "occurred_at, completed_at, created_at, updated_at, odometer_km, fuel_eighths, " +
  "cleanliness, notes, void_reason";

/** GET /api/admin/handovers?reservation_id= */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get("reservation_id");

  if (!reservationId || !UUID.test(reservationId)) {
    return NextResponse.json({ error: "Give the reservation to list handovers for." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("rental_handovers")
    .select(HANDOVER_COLUMNS)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: handoverErrorMessage(error) },
      { status: handoverErrorStatus(error) },
    );
  }
  return NextResponse.json(data ?? []);
}

/**
 * POST — open a handover, or hand back the one already open.
 *
 * §4.2: "client_operation_id makes a tablet retry return the same
 * draft/completed handover rather than create another." A dropped connection
 * on a car park's wifi is the normal case, not the exception, so the retry is
 * answered rather than refused — and it is answered with the *same* row, not a
 * second one that would then compete for the partial unique index.
 *
 * The lookup happens before the insert and again after a unique violation.
 * Checking only before would lose a genuine race between two taps; catching
 * only after would spend an insert on every legitimate retry.
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const reservationId = typeof body.reservation_id === "string" ? body.reservation_id : "";
  const direction = typeof body.direction === "string" ? body.direction : "";
  const clientOperationId = typeof body.client_operation_id === "string" ? body.client_operation_id : "";

  if (!UUID.test(reservationId)) {
    return NextResponse.json({ error: "Choose a reservation." }, { status: 400 });
  }
  if (direction !== "out" && direction !== "in") {
    return NextResponse.json({ error: "A handover is either out or in." }, { status: 400 });
  }
  if (!UUID.test(clientOperationId)) {
    // Required, not generated here. If the server invented one, every retry
    // would be a new operation and the idempotency this exists for would be
    // gone — the tablet has to be the thing that remembers.
    return NextResponse.json(
      { error: "A client operation id is required so a retry returns the same handover." },
      { status: 400 },
    );
  }

  const existing = await supabaseAdmin
    .from("rental_handovers")
    .select(HANDOVER_COLUMNS)
    .eq("client_operation_id", clientOperationId)
    .maybeSingle();

  if (existing.data) return NextResponse.json({ handover: existing.data, resumed: true });

  // The reservation decides the vehicle and the template. Neither is taken from
  // the request: a tablet that could name its own vehicle could file a handover
  // against a car it never saw.
  const reservation = await supabaseAdmin
    .from("reservations")
    .select("id, vehicle_id, vehicles(category)")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservation.error) {
    return NextResponse.json(
      { error: handoverErrorMessage(reservation.error) },
      { status: handoverErrorStatus(reservation.error) },
    );
  }
  if (!reservation.data) {
    return NextResponse.json({ error: "That reservation does not exist." }, { status: 404 });
  }

  const vehicleId = (reservation.data as { vehicle_id?: string | null }).vehicle_id ?? null;
  if (!vehicleId) {
    return NextResponse.json(
      { error: "Assign a vehicle to this reservation before opening a handover." },
      { status: 409 },
    );
  }

  const vehicles = (reservation.data as { vehicles?: { category?: string } | { category?: string }[] }).vehicles;
  const category = Array.isArray(vehicles) ? vehicles[0]?.category : vehicles?.category;
  if (!category) {
    return NextResponse.json({ error: "That vehicle has no category recorded." }, { status: 409 });
  }

  // §4.2: "Both the out and in handover for one reservation use the same
  // template version." So an inbound handover copies the completed outbound
  // one's template rather than looking up today's active template, which may
  // have been superseded during the rental. Migration 042 refuses the mismatch;
  // this is what stops it arising.
  let templateId: string | null = null;

  if (direction === "in") {
    const out = await supabaseAdmin
      .from("rental_handovers")
      .select("inspection_template_id")
      .eq("reservation_id", reservationId)
      .eq("direction", "out")
      .eq("status", "completed")
      .maybeSingle();
    templateId = (out.data as { inspection_template_id?: string } | null)?.inspection_template_id ?? null;
  }

  if (!templateId) {
    const active = await supabaseAdmin
      .from("inspection_templates")
      .select("id")
      .eq("vehicle_category", category)
      .eq("active", true)
      .maybeSingle();
    templateId = (active.data as { id?: string } | null)?.id ?? null;
  }

  if (!templateId) {
    return NextResponse.json(
      { error: `No active inspection template exists for ${category}.` },
      { status: 409 },
    );
  }

  const inserted = await supabaseAdmin
    .from("rental_handovers")
    .insert({
      reservation_id: reservationId,
      vehicle_id: vehicleId,
      direction,
      status: "draft",
      client_operation_id: clientOperationId,
      inspection_template_id: templateId,
      created_by: await actorId(),
    })
    .select(HANDOVER_COLUMNS)
    .single();

  if (!inserted.error) {
    return NextResponse.json({ handover: inserted.data, resumed: false }, { status: 201 });
  }

  // A retry that arrived while the first insert was still in flight. Answer it
  // with the row that won rather than with the collision.
  if (inserted.error.code === "23505") {
    const raced = await supabaseAdmin
      .from("rental_handovers")
      .select(HANDOVER_COLUMNS)
      .eq("client_operation_id", clientOperationId)
      .maybeSingle();
    if (raced.data) return NextResponse.json({ handover: raced.data, resumed: true });
  }

  return NextResponse.json(
    { error: handoverErrorMessage(inserted.error) },
    { status: handoverErrorStatus(inserted.error) },
  );
}
