import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/vehicles/availability
//   ?vehicle_id=&pickup_date=&return_date=&pickup_time=&return_time=&exclude_id=
//
// The previous version compared dates alone with strict inequalities, so a
// rental ending on the 20th did not clash with one starting on the 20th and a
// car back at 10:30 could be promised to the next customer at 11:30. Times are
// now part of the comparison, and each vehicle's turnaround window is added to
// the end of every existing rental before the overlap is measured.

// Only used if the column is somehow absent; matches the car default so the
// fallback behaves like the fleet rather than inventing a stricter rule.
const DEFAULT_TURNAROUND_MIN = 120;

/** Reservation times are stored as 'HH:MM' text; anything unparseable falls back to 09:00. */
function toInstant(date: string, time: string | null | undefined): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 0;
  return new Date(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Row {
  id: string;
  customer_name: string;
  pickup_date: string;
  return_date: string;
  pickup_time: string | null;
  return_time: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicle_id = searchParams.get("vehicle_id");
  const pickup_date = searchParams.get("pickup_date");
  const return_date = searchParams.get("return_date");
  const pickup_time = searchParams.get("pickup_time");
  const return_time = searchParams.get("return_time");
  const exclude_id = searchParams.get("exclude_id"); // reservation being edited

  if (!vehicle_id || !pickup_date || !return_date) {
    return NextResponse.json({ available: true });
  }

  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("turnaround_minutes")
    .eq("id", vehicle_id)
    .maybeSingle();

  // Falls back to the car default if the column has not been migrated yet, so
  // a pending migration degrades to the old behaviour rather than to no check.
  const turnaround = typeof vehicle?.turnaround_minutes === "number"
    ? vehicle.turnaround_minutes
    : DEFAULT_TURNAROUND_MIN;

  const wantStart = toInstant(pickup_date, pickup_time);
  const wantEnd = toInstant(return_date, return_time);

  // Widen the fetch by a day either side: a rental ending the day before can
  // still block this one once its turnaround is added, and the exact test
  // below is done in code rather than in the query.
  const fetchFrom = isoDay(addMinutes(wantStart, -24 * 60));
  const fetchTo = isoDay(addMinutes(wantEnd, 24 * 60));

  let query = supabaseAdmin
    .from("reservations")
    .select("id, customer_name, pickup_date, return_date, pickup_time, return_time")
    .eq("vehicle_id", vehicle_id)
    .not("status", "in", '("cancelled","voided","no_show")')
    .lte("pickup_date", fetchTo)
    .gte("return_date", fetchFrom);

  if (exclude_id) query = query.not("id", "eq", exclude_id);

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  for (const r of rows) {
    const bookedStart = toInstant(r.pickup_date, r.pickup_time);
    const bookedEnd = toInstant(r.return_date, r.return_time);
    const readyAt = addMinutes(bookedEnd, turnaround);

    // Half-open intervals: a rental may begin exactly when the vehicle is ready.
    const clashes = bookedStart < wantEnd && readyAt > wantStart;
    if (!clashes) continue;

    // Distinguish a real double-booking from a gap that is merely too short —
    // the first is impossible, the second is a judgement call for the operator.
    const overlapsRentalItself = bookedStart < wantEnd && bookedEnd > wantStart;

    return NextResponse.json({
      available: false,
      conflict: {
        customer_name: r.customer_name,
        pickup_date: r.pickup_date,
        return_date: r.return_date,
        reason: overlapsRentalItself ? "overlap" : "turnaround",
        turnaround_minutes: turnaround,
        // Local time, so staff read the same clock the handover happens on.
        ready_at: `${isoDay(readyAt)} ${String(readyAt.getHours()).padStart(2, "0")}:${String(readyAt.getMinutes()).padStart(2, "0")}`,
        returns_at: `${r.return_date} ${r.return_time ?? "09:00"}`,
      },
    });
  }

  return NextResponse.json({ available: true });
}
