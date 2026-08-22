import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { reservationRef } from "@/lib/wise";

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
  //
  // The message names where it is running and what it can see, because the
  // earlier wording assumed localhost and read as nonsense on the deployed
  // site — which is exactly where it needed to be useful.
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.trim()) {
    const where = process.env.VERCEL_ENV
      ? `the Vercel ${process.env.VERCEL_ENV} environment`
      : "this local environment";
    const alsoMissing = ["STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_SITE_URL"]
      .filter(v => !process.env[v]);
    return NextResponse.json(
      {
        error:
          `STRIPE_SECRET_KEY is empty in ${where}.` +
          (process.env.VERCEL_ENV
            ? " It is listed in Vercel, so either the value was never saved, or this deployment was built before it changed — env vars are read at build time, so a redeploy is needed after any edit."
            : " Add it to .env.local for local testing.") +
          (alsoMissing.length ? ` Also empty here: ${alsoMissing.join(", ")}.` : ""),
        environment: process.env.VERCEL_ENV ?? "local",
      },
      { status: 400 }
    );
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, deposit, stripe_payment_intent, notes, quotes(ref)")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const stripe = getStripe();
  const linkedQuote = Array.isArray(res.quotes) ? res.quotes[0] : res.quotes;
  const displayReference = reservationRef(res.id, res.notes, linkedQuote?.ref);

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
          if (existing.client_reference_id === displayReference) {
            return NextResponse.json({ checkoutUrl: existing.url, sessionId: existing.id, reference: displayReference, reused: true });
          }
          // Links created before the reference fix display the internal UUID.
          // Expire that unpaid session once so the replacement visibly carries
          // the same reference the customer received from the website.
          await stripe.checkout.sessions.expire(existing.id);
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
      client_reference_id: displayReference,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: depositCents,
            product_data: {
              name: `Anadyon Rentals — Deposit ${displayReference}`,
              description: `Reservation reference: ${displayReference}`,
            },
          },
        },
      ],
      metadata: { reservation_id: res.id, reservation_reference: displayReference },
      payment_intent_data: {
        metadata: { reservation_id: res.id, reservation_reference: displayReference },
      },
      success_url: `${SITE_URL}/api/admin/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/admin/reservations/${res.id}?deposit=cancelled`,
    });

    const reference = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
    await supabaseAdmin
      .from("reservations")
      .update({ stripe_payment_intent: reference })
      .eq("id", res.id);

    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id, reference: displayReference });
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
