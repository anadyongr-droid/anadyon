import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  // Stripe verifies the signature against the exact bytes it sent, so the body
  // must be read raw. In the App Router `req.text()` already gives that — the
  // Pages Router `config.api.bodyParser` switch that used to sit here was
  // silently ignored and only made it look like parsing was being configured.
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Stripe webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { reservation_id?: string }; payment_status?: string };
    const reservationId = session.metadata?.reservation_id;
    if (reservationId && session.payment_status === "paid") {
      await supabaseAdmin
        .from("reservations")
        .update({
          status: "confirmed",
          deposit_paid_at: new Date().toISOString(),
        })
        .eq("id", reservationId);

      await sendTelegram(`✅ <b>Deposit Received</b>\nReservation: ${reservationId}`);
    }
  }

  return NextResponse.json({ received: true });
}
