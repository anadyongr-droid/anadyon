import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ROLE_HEADER = "x-anadyon-role";

/**
 * What a staff session may change on a vehicle.
 *
 * proxy.ts admits staff to /api/admin/vehicles because they need the fleet list
 * to assign a vehicle to a booking, and they need to mark one off the road when
 * it will not start. They do not need to write its purchase price, insurance
 * policy number or statutory dates — this route used to pass the whole request
 * body to the update, so any of those was reachable by anyone who could reach
 * the endpoint.
 *
 * Odometer is included because it is read off the dashboard at handover, which
 * is a counter task rather than an office one.
 */
const STAFF_WRITABLE = new Set(["status", "odometer_km", "vehicle_notes"]);

/** Columns nothing should write through this route, whatever the role. */
const NEVER_WRITABLE = new Set(["id", "created_at"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const isAdmin = req.headers.get(ROLE_HEADER) === "admin";

  const update: Record<string, unknown> = {};
  const refused: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (NEVER_WRITABLE.has(key)) continue;
    if (!isAdmin && !STAFF_WRITABLE.has(key)) { refused.push(key); continue; }
    // An untouched date or number input arrives as ""; Postgres rejects that for
    // a typed column.
    update[key] = value === "" ? null : value;
  }

  /*
   * What used to be a refusal is now a proposal.
   *
   * The set of fields is unchanged: exactly the ones this route already
   * declined to let staff write. Rather than telling them to go and find an
   * administrator, the change is recorded and an administrator approves it —
   * the four-eyes rule, with the refusal given somewhere to go. Nothing here
   * lets staff write a column they could not write before; approval is the
   * only thing that writes, and it happens in
   * public.apply_vehicle_change_request.
   *
   * A mixed edit does both, and says so. Odometer and status are counter tasks
   * and save at once; the statutory dates in the same form go to the queue.
   * Refusing the whole submission because one field needs review would lose the
   * odometer reading somebody just took off the dashboard.
   */
  let requested: { id: string; fields: string[] } | null = null;

  if (refused.length) {
    // The reviewer needs to see what it was, and approval needs it to detect
    // that the vehicle moved underneath the request.
    const { data: current, error: readError } = await supabaseAdmin
      .from("vehicles").select("*").eq("id", id).single();
    if (readError || !current) {
      return NextResponse.json({ error: "That vehicle no longer exists." }, { status: 404 });
    }

    const changes: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    for (const key of refused) {
      const proposed = body[key] === "" ? null : body[key];
      // A "change" that changes nothing would sit in the queue asking somebody
      // to approve the value already there.
      if (proposed === current[key]) continue;
      changes[key] = proposed;
      before[key] = current[key] ?? null;
    }

    if (Object.keys(changes).length) {
      const { data: req, error: reqError } = await supabaseAdmin
        .from("vehicle_change_requests")
        .insert({ vehicle_id: id, changes, before, requested_by: null })
        .select("id")
        .single();
      if (reqError) {
        return NextResponse.json(
          { error: `Could not submit for approval: ${reqError.message}` },
          { status: 500 },
        );
      }
      requested = { id: req.id, fields: Object.keys(changes) };
    }
  }

  if (!Object.keys(update).length) {
    // Nothing to write directly. If a proposal was raised that is a success,
    // not the "nothing to update" complaint.
    if (requested) return NextResponse.json({ _requested: requested }, { status: 202 });
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, _requested: requested });
}
