import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/vehicles/availability?vehicle_id=&pickup_date=&return_date=&exclude_id=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicle_id = searchParams.get("vehicle_id");
  const pickup_date = searchParams.get("pickup_date");
  const return_date = searchParams.get("return_date");
  const exclude_id = searchParams.get("exclude_id"); // reservation being edited

  if (!vehicle_id || !pickup_date || !return_date) {
    return NextResponse.json({ available: true });
  }

  let query = supabaseAdmin
    .from("reservations")
    .select("id, customer_name, pickup_date, return_date, vehicles(name)")
    .eq("vehicle_id", vehicle_id)
    .not("status", "in", '("cancelled","voided","no_show")')
    .lt("pickup_date", return_date)
    .gt("return_date", pickup_date);

  if (exclude_id) query = query.not("id", "eq", exclude_id);

  const { data } = await query;

  if (data && data.length > 0) {
    const c = data[0] as { customer_name: string; pickup_date: string; return_date: string };
    return NextResponse.json({
      available: false,
      conflict: {
        customer_name: c.customer_name,
        pickup_date: c.pickup_date,
        return_date: c.return_date,
      },
    });
  }

  return NextResponse.json({ available: true });
}
