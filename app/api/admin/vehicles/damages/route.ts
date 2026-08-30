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
 * per-vehicle margin. This returns none of that.
 *
 * What is left — that a car has unrepaired damage, how bad, and how long it
 * has sat — is the thing staff most need before handing a vehicle to a
 * customer. Restricting it to administrators would put the fact furthest from
 * the person holding the keys, which is the opposite of the point.
 *
 * That reasoning is worth stating because proxy.ts admits staff to
 * "/api/admin/vehicles" by prefix: every route under this path is inside their
 * reach by default. The ledger opts out explicitly at the point of use. This
 * one stays open on purpose rather than by omission.
 *
 * ─── What actually keeps repair_cost out of a staff response ───
 *
 * The view, not the `select` list below. Until 30 August the column list was
 * the whole guard, pinned by a test. Outside review found that too thin and was
 * right: the realistic failure is a refactor to `select("*")` that updates the
 * now-failing pin in the same commit, because a pinning test is edited
 * alongside the code it pins. Column grants are no help — every query here runs
 * under the service role, which bypasses them.
 *
 * `vehicle_open_damage` does not contain repair_cost or charged_to_customer, so
 * no query against it can return them. The explicit list is kept as a second
 * line, not as the line. See supabase/migrations/20260830160000_*.sql and
 * lib/openDamageView.test.ts, which proves the property by running the
 * migration rather than by reading it.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("vehicle_open_damage")
    // The view carries only these four. Naming them anyway means a future
    // column added to the view still has to be asked for deliberately.
    .select("vehicle_id, severity, reported_on, description")
    // `repaired_on is null` lives in the view, so migration 011's partial index
    // is used by every caller rather than by the ones that remember it. That
    // also means repaired_on is not a column here and cannot be filtered on.
    .order("reported_on");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(summariseOpenDamage((data ?? []) as OpenDamageRow[]));
}
