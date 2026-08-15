import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  // Fetch quotes and all reservations in parallel
  const [{ data: quotes, error }, { data: reservations }] = await Promise.all([
    supabaseAdmin.from("quotes").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("reservations").select("status, notes"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build a map from quote ref → best reservation status
  const refStatusMap: Record<string, string> = {};
  for (const r of reservations ?? []) {
    const match = String(r.notes ?? "").match(/^Quote ref: ([A-Z0-9-]+)/);
    if (!match) continue;
    const ref = match[1];
    const prev = refStatusMap[ref];
    // Priority: returned > active > confirmed > pending > cancelled
    const priority = ["cancelled", "voided", "no_show", "pending", "confirmed", "active", "returned"];
    if (!prev || priority.indexOf(r.status) > priority.indexOf(prev)) {
      refStatusMap[ref] = r.status;
    }
  }

  const rows = (quotes ?? []).map((q) => ({
    ...q,
    quote_status: refStatusMap[q.ref] ?? "new",
  }));

  return NextResponse.json(rows);
}
