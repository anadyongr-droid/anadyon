import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";

/**
 * One handover: what it records, and what it still needs.
 *
 * Blueprint §4.2. The GET answers the tablet's whole screen in one request —
 * the handover, the views its template requires, and which of them already
 * have a photograph — because the alternative is three round trips on a car
 * park's wifi to render one form.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLEANLINESS = ["clean", "acceptable", "poor"] as const;

const HANDOVER_COLUMNS =
  "id, reservation_id, vehicle_id, direction, status, client_operation_id, " +
  "inspection_template_id, created_by, completed_by, staff_name_snapshot, " +
  "occurred_at, completed_at, created_at, updated_at, odometer_km, fuel_eighths, " +
  "cleanliness, notes, void_reason";

/** GET /api/admin/handovers/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const handover = await supabaseAdmin
    .from("rental_handovers")
    .select(HANDOVER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (handover.error) {
    return NextResponse.json(
      { error: handoverErrorMessage(handover.error) },
      { status: handoverErrorStatus(handover.error) },
    );
  }
  if (!handover.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Through `unknown`: the generated row type for a long select list widens to
  // a union the compiler will not narrow directly, and asserting the one field
  // this route reads is honest about what is being relied on.
  const row = handover.data as unknown as { inspection_template_id: string };

  const [views, photos] = await Promise.all([
    supabaseAdmin
      .from("inspection_template_views")
      .select("id, view_code, label, sort_order, required")
      .eq("template_id", row.inspection_template_id)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("handover_photos")
      .select("id, template_view_id, object_path, mime_type, byte_size, width_px, height_px, captured_at, uploaded_at")
      .eq("handover_id", id)
      .order("uploaded_at", { ascending: true }),
  ]);

  const photoRows = (photos.data ?? []) as { template_view_id: string }[];
  const taken = new Set(photoRows.map((p) => p.template_view_id));

  // Computed here rather than left to the client, because it is the same
  // question the database asks at finalisation and two implementations of one
  // rule is how a screen comes to say "ready" about a handover the server then
  // refuses.
  const viewRows = (views.data ?? []) as { id: string; required: boolean }[];
  const outstanding = viewRows.filter((v) => v.required && !taken.has(v.id)).map((v) => v.id);

  return NextResponse.json({
    handover: handover.data,
    views: views.data ?? [],
    photos: photos.data ?? [],
    outstanding_required_views: outstanding,
  });
}

/**
 * PATCH — record what staff are reading off the car.
 *
 * Drafts only. A completed handover is corrected through `/correct`, which
 * demands a reason and writes an audit event; letting this route touch one
 * would be an unaudited edit wearing the same verb.
 *
 * Fields are applied only when present, so a tablet can send the odometer
 * without clearing the note it saved a moment earlier.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const patch: Record<string, unknown> = {};

  if ("odometer_km" in body) {
    const v = body.odometer_km;
    if (v === null) patch.odometer_km = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 0) patch.odometer_km = v;
    else return NextResponse.json({ error: "The odometer must be a whole number of kilometres." }, { status: 400 });
  }

  if ("fuel_eighths" in body) {
    const v = body.fuel_eighths;
    if (v === null) patch.fuel_eighths = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 8) patch.fuel_eighths = v;
    else return NextResponse.json({ error: "Fuel is recorded in eighths, from 0 to 8." }, { status: 400 });
  }

  if ("cleanliness" in body) {
    const v = body.cleanliness;
    if (v === null) patch.cleanliness = null;
    else if (typeof v === "string" && CLEANLINESS.includes(v as (typeof CLEANLINESS)[number])) patch.cleanliness = v;
    else return NextResponse.json({ error: `Cleanliness must be one of: ${CLEANLINESS.join(", ")}.` }, { status: 400 });
  }

  if ("notes" in body) {
    const v = body.notes;
    if (v === null) patch.notes = null;
    else if (typeof v === "string") patch.notes = v.trim() || null;
    else return NextResponse.json({ error: "Notes must be text." }, { status: 400 });
  }

  if ("occurred_at" in body) {
    const v = body.occurred_at;
    if (v === null) patch.occurred_at = null;
    else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) {
      if (Date.parse(v) > Date.now()) {
        return NextResponse.json({ error: "A handover cannot have occurred in the future." }, { status: 400 });
      }
      patch.occurred_at = v;
    } else return NextResponse.json({ error: "That is not a valid time." }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // Scoped to drafts in the statement itself rather than checked first. A
  // read-then-write would leave a window in which a finalisation lands between
  // the two, and this update would then quietly edit a completed record.
  const updated = await supabaseAdmin
    .from("rental_handovers")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .select(HANDOVER_COLUMNS)
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json(
      { error: handoverErrorMessage(updated.error) },
      { status: handoverErrorStatus(updated.error) },
    );
  }

  if (!updated.data) {
    // Either it does not exist or it is no longer a draft, and the two need
    // different words: one is a bad link, the other is a colleague who
    // finalised it while this tablet was still typing.
    const still = await supabaseAdmin
      .from("rental_handovers").select("status").eq("id", id).maybeSingle();
    if (!still.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(
      { error: `This handover is ${(still.data as { status: string }).status}. Reload before making changes.` },
      { status: 409 },
    );
  }

  return NextResponse.json({ handover: updated.data });
}
