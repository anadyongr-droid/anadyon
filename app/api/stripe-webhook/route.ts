import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

/**
 * Stripe's deposit webhook.
 *
 * Stripe retries. It retries on a 5xx, on a timeout, and it can redeliver an
 * event that was already handled — so a handler that simply does the work
 * every time it is called will do the work several times. This one used to:
 * each delivery re-applied the update, overwrote deposit_paid_at with the
 * current time, and sent another Telegram. It also answered 200 whether or not
 * the database write succeeded, which tells Stripe the event is done and stops
 * the retries that would have fixed it.
 *
 * Three properties now hold:
 *
 *   Processed once   — the event id is claimed in alert_outbox, whose `key`
 *                      column is UNIQUE. A redelivery loses the race and
 *                      returns without touching anything.
 *   Honest answers   — a failed write returns 5xx, so Stripe retries rather
 *                      than considering the payment recorded.
 *   Real timestamps  — the payment time comes from Stripe's event, not from
 *                      whenever this function happened to run.
 */

/** Prefix for the idempotency claim, so the ledger stays readable. */
const CLAIM = (eventId: string) => `stripe:${eventId}`;

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

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as {
    metadata?: { reservation_id?: string };
    payment_status?: string;
    amount_total?: number | null;
    currency?: string | null;
  };
  const reservationId = session.metadata?.reservation_id;

  if (!reservationId || session.payment_status !== "paid") {
    // Nothing to do, and nothing wrong: an unpaid or unattributed session is
    // not a failure Stripe should retry.
    return NextResponse.json({ received: true, applied: false });
  }

  // ── Claim the event ─────────────────────────────────────────────────────
  // alert_outbox.key is UNIQUE, so this is the whole idempotency mechanism.
  // A duplicate delivery collides here and stops.
  const { error: claimError } = await supabaseAdmin
    .from("alert_outbox")
    .insert({ key: CLAIM(event.id), payload: `checkout.session.completed ${reservationId}` });

  if (claimError) {
    if (claimError.code === "23505") {
      console.info(`[stripe] event ${event.id} already processed; ignoring redelivery`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Could not even record the claim — the store is unwell, so ask Stripe to
    // come back rather than proceeding without idempotency.
    console.error("[stripe] could not claim event:", claimError.message);
    return NextResponse.json({ error: "Could not record event" }, { status: 503 });
  }

  /** Releases the claim so a Stripe retry is able to try again. */
  const releaseClaim = async () => {
    await supabaseAdmin.from("alert_outbox").delete().eq("key", CLAIM(event.id));
  };

  // ── Sanity-check the payment against the reservation ────────────────────
  const { data: reservation, error: lookupError } = await supabaseAdmin
    .from("reservations")
    .select("id, deposit, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (lookupError) {
    console.error("[stripe] reservation lookup failed:", lookupError.message);
    await releaseClaim();
    return NextResponse.json({ error: "Lookup failed" }, { status: 503 });
  }

  if (!reservation) {
    // A paid session naming a reservation that does not exist is worth a human
    // looking at, but retrying will not conjure the row — so it is not a 5xx.
    console.error(`[stripe] paid session references unknown reservation ${reservationId}`);
    await sendTelegram(
      `⚠️ <b>Payment for an unknown reservation</b>\nStripe event <code>${event.id}</code> paid against ` +
      `reservation <code>${reservationId}</code>, which does not exist. Check Stripe before refunding.`
    );
    return NextResponse.json({ received: true, applied: false });
  }

  // Currency and amount are checked but not enforced as a rejection: the money
  // has already moved, so refusing here would only lose the record of it. A
  // mismatch is something a person needs to see.
  const paid = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
  const expected = Number(reservation.deposit);
  const currencyOk = (session.currency ?? "eur").toLowerCase() === "eur";
  const amountOk = paid !== null && Math.abs(paid - expected) < 0.01;

  if (!currencyOk || !amountOk) {
    await sendTelegram(
      `⚠️ <b>Deposit does not match</b>\nReservation <code>${reservationId}</code>\n` +
      `expected €${expected.toFixed(2)}, received ${paid === null ? "unknown" : `${session.currency?.toUpperCase()} ${paid.toFixed(2)}`}\n` +
      `Recorded anyway — check Stripe.`
    );
  }

  // ── Apply it, and check that it applied ─────────────────────────────────
  // Stripe's own event time, not this function's clock: a redelivery hours
  // later must not record the payment as having happened hours late.
  const paidAt = new Date(event.created * 1000).toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({ status: "confirmed", deposit_paid_at: paidAt })
    .eq("id", reservationId)
    .select("id");

  if (updateError || !updated?.length) {
    console.error(
      `[stripe] failed to record deposit for ${reservationId}:`,
      updateError?.message ?? "no rows updated"
    );
    await releaseClaim();
    // 5xx on purpose. Stripe retries, and a retry is exactly what should
    // happen — answering 200 here is how a real payment goes unrecorded.
    return NextResponse.json({ error: "Could not record payment" }, { status: 503 });
  }

  await sendTelegram(`✅ <b>Deposit Received</b>\nReservation: ${reservationId}\n€${expected.toFixed(2)}`);

  await supabaseAdmin
    .from("alert_outbox")
    .update({ sent_at: new Date().toISOString() })
    .eq("key", CLAIM(event.id));

  return NextResponse.json({ received: true, applied: true });
}
