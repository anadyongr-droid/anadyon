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

  if (refused.length) {
    return NextResponse.json(
      { error: `Administrator access is required to change: ${refused.join(", ")}.` },
      { status: 403 }
    );
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
