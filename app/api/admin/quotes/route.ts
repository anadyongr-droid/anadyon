import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const [{ data: quotes, error }, { data: reservations }] = await Promise.all([
    supabaseAdmin.from("quotes").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("reservations").select("status, notes, vehicles(name, plate)"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const priority = ["cancelled", "voided", "no_show", "pending", "confirmed", "active", "returned"];

  // Build a map from quote ref → { status, vehicle name, plate }
  const refMap: Record<string, { status: string; vehicle_name: string; vehicle_plate: string }> = {};
  for (const r of reservations ?? []) {
    const match = String(r.notes ?? "").match(/^Quote ref: ([A-Z0-9-]+)/);
    if (!match) continue;
    const ref = match[1];
    const prev = refMap[ref];
    if (!prev || priority.indexOf(r.status) > priority.indexOf(prev.status)) {
      const v = (r as { vehicles?: { name?: string; plate?: string } | null }).vehicles;
      refMap[ref] = {
        status: r.status,
        vehicle_name: v?.name ?? "",
        vehicle_plate: v?.plate ?? "",
      };
    }
  }

  const rows = (quotes ?? []).map((q) => ({
    ...q,
    quote_status: refMap[q.ref]?.status ?? "new",
    reservation_vehicle_name: refMap[q.ref]?.vehicle_name ?? null,
    reservation_vehicle_plate: refMap[q.ref]?.vehicle_plate ?? null,
  }));

  return NextResponse.json(rows);
}
