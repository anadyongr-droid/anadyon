import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { athensDateTimeToUtc, quoteConfirmationMail } from "@/lib/bookingEmails";
import { mailIsRedirected, mailRedirectTarget, sendMail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";
import { reservationRef } from "@/lib/wise";

const RequestSchema = z.object({
  // A datetime-local field has no offset. It represents Zakynthos wall-clock
  // time regardless of where the staff member's device happens to be.
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

const DELIVERY_COLUMNS = "id, kind, intended_recipient_email, subject, payment_deadline, status, redirected, provider_message_id, accepted_at, delivered_at, last_event_at, last_error, created_at";

/**
 * Every workflow delivery for this reservation, not only the quote
 * confirmations. The caller shows the quote-confirmation history *and* derives
 * the customer email workflow stage, which needs the acknowledgment and the
 * booking confirmation too. The stage is computed from these rows rather than
 * stored, so there is nothing here for a client to set.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("booking_email_deliveries")
    .select(DELIVERY_COLUMNS)
    .eq("reservation_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ deliveries: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid payment deadline." }, { status: 400 });
  }

  const [deadlineDate, deadlineTime] = parsed.data.deadline.split("T");
  const deadline = athensDateTimeToUtc(deadlineDate, deadlineTime);
  if (!Number.isFinite(deadline.getTime())) {
    return NextResponse.json({ error: "Choose a valid payment deadline." }, { status: 400 });
  }
  if (deadline.getTime() <= Date.now()) {
    return NextResponse.json({ error: "The payment deadline must be in the future." }, { status: 400 });
  }

  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, pickup_date, pickup_time, pickup_location, return_date, return_time, total, deposit, balance_due, notes, status, deposit_paid_at, promo_code_id, discount_amount, quote_id, vehicles(name), quotes(ref)")
    .eq("id", id)
    .maybeSingle();

  if (error || !reservation) {
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  }
  if (!reservation.customer_email) {
    return NextResponse.json({ error: "This reservation has no customer email address." }, { status: 400 });
  }
  if (reservation.status !== "pending" || reservation.deposit_paid_at) {
    return NextResponse.json({ error: "Quote confirmation is available only while the booking is pending payment." }, { status: 409 });
  }

  const pickup = athensDateTimeToUtc(reservation.pickup_date, reservation.pickup_time || "09:00");
  if (Number.isFinite(pickup.getTime()) && deadline.getTime() >= pickup.getTime()) {
    return NextResponse.json({ error: "The payment deadline must be before pick-up." }, { status: 400 });
  }

  const linkedQuote = Array.isArray(reservation.quotes) ? reservation.quotes[0] : reservation.quotes;
  const vehicle = Array.isArray(reservation.vehicles) ? reservation.vehicles[0] : reservation.vehicles;
  if (!vehicle?.name) {
    return NextResponse.json({ error: "Assign an eligible vehicle before confirming the quote." }, { status: 409 });
  }
  // This is the point at which a limited promo is actually claimed. A website
  // request only validates the code, so codes can no longer be exhausted by
  // people who never pay; the hold runs until the payment deadline and is
  // released if that passes or the booking is cancelled.
  //
  // Taken before the email goes out: a customer must never be sent a price that
  // includes a discount the code could not supply.
  if (reservation.promo_code_id) {
    const { data: held, error: holdError } = await supabaseAdmin.rpc("promo_hold", {
      p_promo_id: reservation.promo_code_id,
      p_reservation_id: reservation.id,
      p_expires_at: deadline.toISOString(),
      p_amount: Number(reservation.discount_amount) || 0,
      p_quote_id: reservation.quote_id ?? null,
    });
    if (holdError) {
      console.error("[quote-confirmation] promo hold failed:", holdError.message);
      return NextResponse.json({ error: "The promo code on this booking could not be reserved. Please try again." }, { status: 503 });
    }
    const result = held as { ok?: boolean; reason?: string } | null;
    if (!result?.ok) {
      const because: Record<string, string> = {
        exhausted: "That promo code has now been fully used. Remove the discount or apply a different code before confirming.",
        expired: "That promo code has expired. Remove the discount or apply a different code before confirming.",
        inactive: "That promo code is no longer active. Remove the discount or apply a different code before confirming.",
        unknown_code: "The promo code on this booking no longer exists. Remove the discount before confirming.",
        other_code_held: "A different promo code is already held for this booking. Review the discount before confirming.",
      };
      return NextResponse.json(
        { error: because[result?.reason ?? ""] ?? "The promo code on this booking is no longer usable." },
        { status: 409 },
      );
    }
  }

  const reference = reservationRef(reservation.id, reservation.notes, linkedQuote?.ref);
  const mail = quoteConfirmationMail({
    customerName: reservation.customer_name,
    customerEmail: reservation.customer_email,
    reference,
    vehicle: vehicle.name,
    pickupDate: reservation.pickup_date,
    pickupTime: reservation.pickup_time,
    pickupLocation: reservation.pickup_location,
    returnDate: reservation.return_date,
    returnTime: reservation.return_time,
    total: Number(reservation.total),
    deposit: Number(reservation.deposit),
    balanceDue: Number(reservation.balance_due),
  }, deadline);

  // The audit row exists before the provider call, so every button press has a
  // durable record even if Resend times out. Its UUID is also sent as a Resend
  // tag, allowing an unusually fast webhook to correlate before the provider
  // message ID has been written back.
  const { data: delivery, error: deliveryError } = await supabaseAdmin
    .from("booking_email_deliveries")
    .insert({
      reservation_id: reservation.id,
      kind: "quote_confirmation",
      intended_recipient_email: reservation.customer_email,
      delivery_recipient_email: mailRedirectTarget ?? reservation.customer_email,
      subject: mail.subject,
      payment_deadline: deadline.toISOString(),
      redirected: mailIsRedirected,
    })
    .select("id")
    .single();

  if (deliveryError || !delivery) {
    console.error("[quote-confirmation] could not create delivery audit row:", deliveryError?.message);
    return NextResponse.json({ error: "The quote confirmation could not be audited, so it was not sent." }, { status: 503 });
  }

  mail.tags = [
    { name: "category", value: "quote_confirmation" },
    { name: "delivery_id", value: delivery.id },
  ];
  const sent = await sendMail(mail, {
    deliveryId: delivery.id,
    idempotencyKey: `quote-confirmation-${delivery.id}`,
  });

  if (!sent.ok && !sent.queued) {
    return NextResponse.json({ error: "The quote confirmation could not be sent or queued. Please try again." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    reference,
    deliveryId: delivery.id,
    queued: sent.queued,
    redirected: mailIsRedirected,
  });
}
