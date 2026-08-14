import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select("*, reservations(status)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Derive a single representative status per quote
  const rows = (data ?? []).map((q) => {
    const reservations: { status: string }[] = Array.isArray(q.reservations) ? q.reservations : [];
    let quoteStatus = "new";
    if (reservations.length > 0) {
      const active = reservations.find((r) => r.status === "active");
      const confirmed = reservations.find((r) => r.status === "confirmed");
      const returned = reservations.find((r) => r.status === "returned");
      const pending = reservations.find((r) => r.status === "pending");
      const cancelled = reservations.every((r) => ["cancelled", "voided", "no_show"].includes(r.status));
      if (returned) quoteStatus = "returned";
      else if (active) quoteStatus = "active";
      else if (confirmed) quoteStatus = "confirmed";
      else if (pending) quoteStatus = "pending";
      else if (cancelled) quoteStatus = "cancelled";
    }
    return { ...q, quote_status: quoteStatus };
  });

  return NextResponse.json(rows);
}
