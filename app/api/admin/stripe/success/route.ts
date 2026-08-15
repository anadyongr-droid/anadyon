import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/stripe/success?session_id=...
// Called by Stripe after successful checkout. Verifies payment and shows confirmation.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(new URL("/admin/reservations", req.url));
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const reservationId = session.metadata?.reservation_id;

    if (reservationId && session.payment_status === "paid") {
      // Ensure reservation is confirmed (webhook may have already done this)
      await supabaseAdmin
        .from("reservations")
        .update({ status: "confirmed", deposit_paid_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("status", "pending"); // Only update if still pending

      return NextResponse.redirect(new URL(`/admin/reservations/${reservationId}?deposit=paid`, req.url));
    }
  } catch (err) {
    console.error("Stripe success route error:", err);
  }

  return NextResponse.redirect(new URL("/admin/reservations", req.url));
}
