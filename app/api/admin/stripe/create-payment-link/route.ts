import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anadyon.gr";

/**
 * POST /api/admin/stripe/create-payment-link  { reservationId }
 *
 * Every failure below used to surface as the same "Failed to create payment
 * link", because nothing was caught and a thrown Stripe error became an
 * unhandled 500 with no body. A missing key, an unactivated account and a
 * card-payments capability that has not been granted are three different
 * problems with three different fixes, and the operator could not tell them
 * apart.
 */
export async function POST(req: NextRequest) {
  const { reservationId } = await req.json();
  if (!reservationId) return NextResponse.json({ error: "Missing reservationId" }, { status: 400 });

  // Checked explicitly. getStripe() passes "" when the variable is unset, and
  // Stripe then answers with an authentication error that reads as though the
  // key were wrong rather than absent.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not set in this environment. It is configured in Vercel, so this will fail on localhost but work on the deployed site." },
      { status: 400 }
    );
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, deposit, stripe_payment_intent")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const stripe = getStripe();

  // A previously created link. The stored value may be either a payment intent
  // or a checkout session id — the write below falls back to the session id
  // when Stripe has not yet created an intent, which it does not do until the
  // customer actually pays. Retrieving a "cs_…" through paymentIntents threw,
  // so a second click on any unpaid reservation failed outright.
  if (res.stripe_payment_intent) {
    try {
      if (res.stripe_payment_intent.startsWith("cs_")) {
        const existing = await stripe.checkout.sessions.retrieve(res.stripe_payment_intent);
        if (existing.status === "open" && existing.url) {
          return NextResponse.json({ checkoutUrl: existing.url, sessionId: existing.id, reused: true });
        }
        if (existing.payment_status === "paid") {
          return NextResponse.json({ error: "This deposit has already been paid." }, { status: 400 });
        }
        // Expired or abandoned — fall through and issue a fresh one.
      } else {
        const intent = await stripe.paymentIntents.retrieve(res.stripe_payment_intent);
        if (intent.status === "succeeded") {
          return NextResponse.json({ error: "This deposit has already been paid." }, { status: 400 });
        }
      }
    } catch {
      // A stale or unrecognised reference is not worth failing over; issue a
      // new link rather than leaving the operator stuck.
    }
  }

  const depositCents = Math.round(Number(res.deposit) * 100);
  if (depositCents <= 0) {
    return NextResponse.json({ error: "This reservation has no deposit amount to charge." }, { status: 400 });
  }

  try {
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
              name: "Anadyon Rentals — Deposit for reservation",
              description: `Reservation ID: ${res.id}`,
            },
          },
        },
      ],
      metadata: { reservation_id: res.id },
      success_url: `${SITE_URL}/api/admin/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/admin/reservations/${res.id}?deposit=cancelled`,
    });

    const reference = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
    await supabaseAdmin
      .from("reservations")
      .update({ stripe_payment_intent: reference })
      .eq("id", res.id);

    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    // Stripe's own message names the actual problem — an inactive account, a
    // capability that has not been granted, a key from the wrong mode. Passing
    // it through is the difference between a five-minute fix and guesswork.
    const message = err instanceof Error ? err.message : "Stripe rejected the request.";
    const type = (err as { type?: string })?.type;
    console.error("Stripe checkout session failed:", type, message);
    return NextResponse.json(
      { error: `Stripe: ${message}`, stripeErrorType: type ?? null },
      { status: 502 }
    );
  }
}
