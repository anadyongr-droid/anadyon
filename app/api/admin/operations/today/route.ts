import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { dayEvents, findOverdue, licenceStatus, serviceStatus, instant } from "@/lib/operations";
import { vehicleDateStatuses, rentalBar } from "@/lib/fleetStatus";

// Staff-accessible: this is the screen they work from. Nothing financial is
// returned — no rates, totals, costs or margins — so it stays inside what a
// staff session may see.
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // A window either side of today: yesterday's late returns still matter this
  // morning, and tomorrow's first collection is worth seeing before closing.
  const from = new Date(now); from.setDate(from.getDate() - 14);
  const to = new Date(now); to.setDate(to.getDate() + 2);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [resRes, vehRes] = await Promise.all([
    supabaseAdmin
      .from("reservations")
      .select("id, customer_name, customer_email, customer_phone, customer_dob, status, pickup_date, pickup_time, return_date, return_time, pickup_location, dropoff_location, vehicle_id, flight_number, customer_id")
      .gte("return_date", iso(from))
      .lte("pickup_date", iso(to)),
    supabaseAdmin
      .from("vehicles")
      .select("id, name, plate, status, pricing_group, kteo_expiry, insurance_expiry, road_tax_paid_until, next_service_due, odometer_km, service_interval_km"),
  ]);

  if (resRes.error) return NextResponse.json({ error: resRes.error.message }, { status: 500 });
  if (vehRes.error) return NextResponse.json({ error: vehRes.error.message }, { status: 500 });

  const reservations = resRes.data ?? [];
  const vehicles = vehRes.data ?? [];
  const vehicleById = new Map(vehicles.map(v => [v.id, v]));

  // Licence data lives on the customer, not the reservation, so it is fetched
  // only for the customers actually involved in today's movements.
  const customerIds = [...new Set(reservations.map(r => r.customer_id).filter(Boolean))] as string[];
  const { data: customers } = customerIds.length
    ? await supabaseAdmin
        .from("customers")
        .select("id, driving_licence_number, driving_licence_expiry, dob")
        .in("id", customerIds)
    : { data: [] };
  const customerById = new Map((customers ?? []).map(c => [c.id, c]));

  const events = dayEvents(reservations, now).map(e => {
    const v = e.reservation.vehicle_id ? vehicleById.get(e.reservation.vehicle_id) : null;
    const c = e.reservation.customer_id ? customerById.get(e.reservation.customer_id) : null;

    // Judged at this movement's own time, not at "now" — a licence valid this
    // morning may not be at a collection three days out.
    const licence = c ? licenceStatus(c, e.at) : null;

    // Only meaningful for a collection: what stops this vehicle leaving.
    const bar = v && e.kind === "pickup" ? rentalBar(v, e.at) : null;

    const missing: string[] = [];
    if (!e.reservation.customer_dob) missing.push("date of birth");
    if (!e.reservation.customer_phone) missing.push("phone");
    if (c && licence?.severity === "missing") missing.push("driving licence");

    return {
      kind: e.kind,
      at: e.at.toISOString(),
      time: `${String(e.at.getHours()).padStart(2, "0")}:${String(e.at.getMinutes()).padStart(2, "0")}`,
      reservation: {
        id: e.reservation.id,
        customer_name: e.reservation.customer_name,
        customer_phone: e.reservation.customer_phone,
        flight_number: e.reservation.flight_number,
        location: e.kind === "pickup" ? e.reservation.pickup_location : e.reservation.dropoff_location,
        status: e.reservation.status,
      },
      vehicle: v ? { id: v.id, name: v.name, plate: v.plate } : null,
      licence,
      blocked: bar?.barred ? bar.reason : null,
      missing,
    };
  });

  const overdue = findOverdue(reservations, now).map(o => ({
    id: o.reservation.id,
    customer_name: o.reservation.customer_name,
    customer_phone: o.reservation.customer_phone,
    vehicle: o.reservation.vehicle_id ? vehicleById.get(o.reservation.vehicle_id)?.name ?? null : null,
    dueAt: o.dueAt.toISOString(),
    hoursLate: Math.floor(o.minutesLate / 60),
    urgency: o.urgency,
  }));

  // Fleet attention: anything grounded, lapsing, or approaching a service.
  const fleet = vehicles
    .map(v => {
      const bar = rentalBar(v, now);
      const worst = vehicleDateStatuses(v, now)[0];
      const service = serviceStatus(v);
      return { v, bar, worst, service };
    })
    .filter(x =>
      x.bar.barred ||
      x.worst?.severity === "expired" || x.worst?.severity === "due-soon" ||
      x.service.severity === "overdue" || x.service.severity === "due-soon"
    )
    .map(x => ({
      id: x.v.id,
      name: x.v.name,
      plate: x.v.plate,
      barred: x.bar.barred ? x.bar.reason : null,
      paperwork: x.worst && x.worst.severity !== "ok" ? x.worst.message : null,
      service: x.service.severity === "overdue" || x.service.severity === "due-soon" ? x.service.message : null,
    }));

  return NextResponse.json({
    date: todayIso,
    generatedAt: now.toISOString(),
    events,
    overdue,
    fleet,
    counts: {
      pickups: events.filter(e => e.kind === "pickup").length,
      returns: events.filter(e => e.kind === "return").length,
      overdue: overdue.length,
      fleetAttention: fleet.length,
      // Anything a member of staff must resolve before a vehicle can leave.
      blockers: events.filter(e => e.blocked || e.licence?.blocks).length,
    },
  });
}
