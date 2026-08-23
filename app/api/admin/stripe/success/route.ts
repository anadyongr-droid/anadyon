import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { confirmPaidBooking } from "@/lib/confirmPaidBooking";

// GET /api/admin/stripe/success?session_id=...
// Called by Stripe after successful checkout. Verifies payment and shows confirmation.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(new URL("/payment/cancelled", req.url));
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const reservationId = session.metadata?.reservation_id;

    if (session.payment_status === "paid" && !reservationId) {
      const url = new URL("/payment/success", req.url);
      url.searchParams.set("review", "1");
      return NextResponse.redirect(url);
    }

    if (reservationId && session.payment_status === "paid") {
      // The signed webhook is authoritative, but this verified return path is a
      // safe fallback if it arrives first. The shared conditional update means
      // whichever path loses the race cannot send a second confirmation email.
      const result = await confirmPaidBooking({
        reservationId,
        paidAt: new Date(session.created * 1000).toISOString(),
        amountPaid: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
        currency: session.currency,
      });
      const reference = result.outcome === "not_found" || result.outcome === "error"
        ? session.metadata?.reservation_reference ?? ""
        : result.reference;
      const url = new URL("/payment/success", req.url);
      if (reference) url.searchParams.set("reference", reference);
      if (["payment_mismatch", "invalid_state", "not_found", "error"].includes(result.outcome)) {
        url.searchParams.set("review", "1");
      }
      return NextResponse.redirect(url);
    }
  } catch (err) {
    console.error("Stripe success route error:", err);
    const url = new URL("/payment/success", req.url);
    url.searchParams.set("review", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL("/payment/cancelled", req.url));
}
