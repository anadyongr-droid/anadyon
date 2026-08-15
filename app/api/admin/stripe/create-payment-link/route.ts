import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

// POST /api/admin/stripe/create-payment-link  { reservationId }
export async function POST(req: NextRequest) {
  const { reservationId } = await req.json();
  if (!reservationId) return NextResponse.json({ error: "Missing reservationId" }, { status: 400 });

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, deposit, stripe_payment_intent")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const stripe = getStripe();

  if (res.stripe_payment_intent) {
    const existing = await stripe.paymentIntents.retrieve(res.stripe_payment_intent);
    return NextResponse.json({ paymentIntentId: existing.id, status: existing.status });
  }

  const depositCents = Math.round(Number(res.deposit) * 100);
  if (depositCents <= 0) return NextResponse.json({ error: "No deposit amount" }, { status: 400 });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: res.customer_email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: depositCents,
          product_data: {
            name: `Anadyon Rentals — Deposit for reservation`,
            description: `Reservation ID: ${res.id}`,
          },
        },
      },
    ],
    metadata: { reservation_id: res.id },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/reservations/${res.id}?deposit=cancelled`,
  });

  // Store the payment intent
  await supabaseAdmin
    .from("reservations")
    .update({ stripe_payment_intent: session.payment_intent as string })
    .eq("id", res.id);

  return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
}
