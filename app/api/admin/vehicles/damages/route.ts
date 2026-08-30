import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { summariseOpenDamage, type OpenDamageRow } from "@/lib/openDamage";

/**
 * Open damage across the whole fleet, in one request.
 *
 * The per-vehicle ledger already returns this, but only for one vehicle and
 * only to an administrator, because it serves purchase prices and margin
 * alongside. Asking it twenty-nine times to fill a list would be twenty-nine
 * round trips and would still refuse staff.
 *
 * ─── Why this one is NOT admin-only, when the ledger next door is ───
 *
 * The ledger's restriction is about money: purchase price, running costs,
 * per-vehicle margin. This returns none of that. `repair_cost` is not
 * selected, so it cannot leak through a field nobody trimmed later.
 *
 * What is left — that a car has unrepaired damage, how bad, and how long it
 * has sat — is the thing staff most need before handing a vehicle to a
 * customer. Restricting it to administrators would put the fact furthest from
 * the person holding the keys, which is the opposite of the point.
 *
 * That reasoning is worth stating because proxy.ts admits staff to
 * "/api/admin/vehicles" by prefix: every route under this path is inside their
 * reach by default. The ledger opts out explicitly at the point of use. This
 * one stays open on purpose rather than by omission — and the `select` is the
 * enforcement, not a role check.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("vehicle_damages")
    // Deliberately not `*`, and deliberately not repair_cost or
    // charged_to_customer. See the note above.
    .select("vehicle_id, severity, reported_on, description")
    // The filter belongs in SQL: migration 011 built a partial index for
    // exactly this predicate, and it only helps if Postgres sees it.
    .is("repaired_on", null)
    .order("reported_on");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(summariseOpenDamage((data ?? []) as OpenDamageRow[]));
}
