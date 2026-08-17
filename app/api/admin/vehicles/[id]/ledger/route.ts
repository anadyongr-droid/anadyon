import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { computeMargin } from "@/lib/fleetStatus";

// One vehicle's financial picture: what it earned, what it cost, what is
// damaged. Served together because the margin is meaningless without both
// sides, and fetching them separately invites a UI that shows one before the
// other and reads as a loss that is not there.
//
// ADMIN ONLY, and enforced here rather than left to proxy.ts. The proxy admits
// staff to "/api/admin/vehicles" by prefix, so this path is inside their reach —
// they need the fleet list to assign a vehicle to a booking. Purchase prices,
// running costs and per-vehicle margin are a different matter, so the check is
// made at the point of use instead of by widening the proxy's rules.
//
// The role header is trustworthy: proxy.ts deletes any client-supplied value
// before setting the resolved one.

type Ctx = { params: Promise<{ id: string }> };

const ROLE_HEADER = "x-anadyon-role";

function refuseNonAdmin(req: NextRequest): NextResponse | null {
  if (req.headers.get(ROLE_HEADER) === "admin") return null;
  return NextResponse.json(
    { error: "Vehicle financials are restricted to administrators." },
    { status: 403 }
  );
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const refused = refuseNonAdmin(_req);
  if (refused) return refused;

  const { id } = await params;

  const [costsRes, damagesRes, revenueRes] = await Promise.all([
    supabaseAdmin
      .from("vehicle_costs")
      .select("*")
      .eq("vehicle_id", id)
      .order("incurred_on", { ascending: false }),
    supabaseAdmin
      .from("vehicle_damages")
      .select("*")
      .eq("vehicle_id", id)
      .order("reported_on", { ascending: false }),
    // Cancelled, voided and no-show rentals never earned anything, so counting
    // them would inflate every vehicle's revenue by the bookings that fell
    // through — exactly the vehicles that look busiest on the calendar.
    supabaseAdmin
      .from("reservations")
      .select("total, rental_days, pickup_date, return_date")
      .eq("vehicle_id", id)
      .not("status", "in", '("cancelled","voided","no_show")'),
  ]);

  if (costsRes.error)   return NextResponse.json({ error: costsRes.error.message },   { status: 500 });
  if (damagesRes.error) return NextResponse.json({ error: damagesRes.error.message }, { status: 500 });
  if (revenueRes.error) return NextResponse.json({ error: revenueRes.error.message }, { status: 500 });

  const costs = costsRes.data ?? [];
  const damages = damagesRes.data ?? [];
  const rentals = revenueRes.data ?? [];

  const revenue = rentals.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  const costTotal = costs.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  // Damage charged to the customer is recovered, so only what the business
  // absorbed counts against the vehicle.
  const absorbedDamage = damages
    .filter(d => !d.charged_to_customer)
    .reduce((sum, d) => sum + Number(d.repair_cost ?? 0), 0);

  const rentalDays = rentals.reduce((sum, r) => sum + Number(r.rental_days ?? 0), 0);

  return NextResponse.json({
    costs,
    damages,
    margin: computeMargin({ revenue, costs: costTotal, absorbedDamage }),
    rentals: {
      count: rentals.length,
      days: rentalDays,
      // Revenue per rental day: comparable across vehicles regardless of how
      // long each was out, unlike a raw revenue total.
      revenuePerDay: rentalDays > 0 ? Math.round((revenue / rentalDays) * 100) / 100 : null,
    },
    openDamages: damages.filter(d => !d.repaired_on).length,
  });
}

/** Adds a cost or a damage. `kind` selects which. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const refused = refuseNonAdmin(req);
  if (refused) return refused;

  const { id } = await params;
  const body = await req.json();
  const { kind, ...row } = body;

  if (kind !== "cost" && kind !== "damage") {
    return NextResponse.json({ error: "kind must be 'cost' or 'damage'" }, { status: 400 });
  }

  const table = kind === "cost" ? "vehicle_costs" : "vehicle_damages";

  // Empty date and numeric inputs arrive as "" and Postgres rejects them for
  // typed columns; the same fault that broke the reservation and customer forms.
  const cleaned: Record<string, unknown> = { vehicle_id: id };
  for (const [k, v] of Object.entries(row)) {
    cleaned[k] = v === "" ? null : v;
  }

  if (kind === "cost" && (cleaned.amount === null || cleaned.amount === undefined)) {
    return NextResponse.json({ error: "An amount is required." }, { status: 400 });
  }
  if (kind === "damage" && !String(cleaned.description ?? "").trim()) {
    return NextResponse.json({ error: "A description is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from(table).insert(cleaned).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Removes a cost or damage row. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const refused = refuseNonAdmin(req);
  if (refused) return refused;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const rowId = searchParams.get("rowId");

  if (!rowId || (kind !== "cost" && kind !== "damage")) {
    return NextResponse.json({ error: "kind and rowId are required" }, { status: 400 });
  }

  const table = kind === "cost" ? "vehicle_costs" : "vehicle_damages";
  // Scoped by vehicle as well as row id, so a mistyped id cannot delete another
  // vehicle's record.
  const { error } = await supabaseAdmin.from(table).delete().eq("id", rowId).eq("vehicle_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
