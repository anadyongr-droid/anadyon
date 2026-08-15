import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  // Last 6 months of monthly revenue + reservation counts
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const from = sixMonthsAgo.toISOString().slice(0, 10);

  const { data: reservations } = await supabaseAdmin
    .from("reservations")
    .select("pickup_date, total, status")
    .gte("pickup_date", from)
    .not("status", "in", '("cancelled","voided","no_show")');

  const { data: vehicles } = await supabaseAdmin
    .from("vehicles")
    .select("id, status")
    .neq("status", "retired");

  // Build monthly buckets
  const months: Record<string, { label: string; revenue: number; count: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    months[key] = { label, revenue: 0, count: 0 };
  }

  for (const r of reservations ?? []) {
    const key = r.pickup_date?.slice(0, 7);
    if (key && months[key]) {
      months[key].revenue += Number(r.total) || 0;
      months[key].count += 1;
    }
  }

  const totalVehicles = vehicles?.length ?? 0;
  const activeVehicles = vehicles?.filter((v) => v.status === "active" || v.status === "rented").length ?? 0;

  return NextResponse.json({
    monthly: Object.values(months),
    totalVehicles,
    activeVehicles,
  });
}
