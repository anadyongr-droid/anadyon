import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { athensDateTimeToUtc, quoteConfirmationMail } from "@/lib/bookingEmails";
import { mailIsRedirected, sendMail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";
import { reservationRef } from "@/lib/wise";

const RequestSchema = z.object({
  // A datetime-local field has no offset. It represents Zakynthos wall-clock
  // time regardless of where the staff member's device happens to be.
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

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
    .select("id, customer_name, customer_email, pickup_date, pickup_time, pickup_location, return_date, return_time, total, deposit, balance_due, notes, status, deposit_paid_at, vehicles(name), quotes(ref)")
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
  const reference = reservationRef(reservation.id, reservation.notes, linkedQuote?.ref);
  const sent = await sendMail(quoteConfirmationMail({
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
  }, deadline));

  if (!sent.ok && !sent.queued) {
    return NextResponse.json({ error: "The quote confirmation could not be sent or queued. Please try again." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    reference,
    queued: sent.queued,
    redirected: mailIsRedirected,
  });
}
