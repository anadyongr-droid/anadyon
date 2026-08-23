import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { validateQuoteVehicleAssignment } from "@/lib/quoteVehicleAssignment";
import { confirmPaidBooking } from "@/lib/confirmPaidBooking";
import { validateSeatTotals } from "@/lib/seatLimits";

/** Statuses that mean the rental will not happen, so a promo hold is given back. */
const RELEASES_PROMO = new Set(["cancelled", "voided", "no_show"]);

/**
 * Postgres integrity errors are caused by the request, not by the server.
 * 23514 check violation, 23502 not-null, 23503 foreign key, 22P02 bad input
 * syntax, PGRST204 unknown column. Reporting these as 500 hid real input
 * mistakes behind an outage-shaped error.
 */
function statusForPgError(code?: string): number {
  return ["23514", "23502", "23503", "23505", "22P02", "22007", "PGRST204"].includes(code ?? "")
    ? 400
    : 500;
}

async function touchCustomer(customerId: string | null | undefined) {
  if (!customerId) return;
  await supabaseAdmin
    .from("customers")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("id", customerId);
}


export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, plate, category)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json();

  // quote_id is the immutable provenance link created with the web booking.
  // It must not be possible to unlink it in the browser and thereby evade the
  // assignment rules below.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("reservations")
    .select("quote_id, vehicle_id, status, deposit_paid_at, total, deposit, balance_due")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) {
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  }

  // `_prev_status` was historically sent by the form to say what changed. The
  // route now reads the authoritative status from the database instead, but a
  // stale client may still send it. It is not a column, and spreading the body into the
  // update made Postgres reject the write with "Could not find the
  // '_prev_status' column" — so EVERY edit to an existing reservation failed
  // silently from the operator's point of view: the status never changed, and
  // re-converting the quote created a duplicate and a "New Reservation" email
  // instead.
  //
  // Anything the client should not write is stripped here rather than passed
  // through, which is the same blind-spread fault that has now bitten three
  // different routes.
  // Anything the form prefixes with an underscore is its own state, not a
  // column: `_daily_rate_override` holds a rate the operator typed and
  // `_payment_verified` is a one-request staff attestation. Naming them one by one meant the next one
  // added broke every save with a 400 until someone noticed — a rule does not
  // need updating.
  const body = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("_") && !["id", "created_at", "quote_id", "source"].includes(k))
  );

  // `confirmed` means payment received, not merely "we found a vehicle".
  // The quote-confirmation action below leaves the row pending. A manual
  // transition to confirmed therefore requires an explicit staff attestation;
  // Stripe reaches the same state through its signed webhook instead.
  const manualPaymentConfirmation = body.status === "confirmed" && existing.status !== "confirmed";
  const retryPaidConfirmation = body.status === "confirmed" && existing.status === "confirmed" &&
    Boolean(existing.deposit_paid_at) && raw._payment_verified === true;
  if (manualPaymentConfirmation && raw._payment_verified !== true) {
    return NextResponse.json(
      { error: "Confirm the booking only after verifying that the deposit or full payment has been received." },
      { status: 400 },
    );
  }
  if (manualPaymentConfirmation && existing.status !== "pending") {
    return NextResponse.json(
      { error: `A ${existing.status} reservation cannot be confirmed through the payment workflow.` },
      { status: 409 },
    );
  }
  const paymentAmount = Number(raw._payment_amount);
  if (manualPaymentConfirmation) {
    const effectiveTotal = Number(body.total ?? existing.total);
    const effectiveDeposit = Number(body.deposit ?? existing.deposit);
    const matchesDeposit = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - effectiveDeposit) < 0.01;
    const matchesTotal = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - effectiveTotal) < 0.01;
    if (!matchesDeposit && !matchesTotal) {
      return NextResponse.json(
        { error: `Enter exactly €${effectiveDeposit.toFixed(2)} (deposit) or €${effectiveTotal.toFixed(2)} (full payment).` },
        { status: 400 },
      );
    }
  }
  if (manualPaymentConfirmation) delete body.status;

  const assignmentProblem = await validateQuoteVehicleAssignment(
    existing.quote_id,
    typeof body.vehicle_id === "string" ? body.vehicle_id : existing.vehicle_id,
  );
  if (assignmentProblem) {
    return NextResponse.json({ error: assignmentProblem.error }, { status: assignmentProblem.status });
  }

  // Overlap check when a vehicle is assigned
  if (body.vehicle_id && body.pickup_date && body.return_date) {
    const { data: conflicts } = await supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("vehicle_id", body.vehicle_id)
      .not("id", "eq", id)
      .not("status", "in", '("cancelled","voided","no_show")')
      .lt("pickup_date", body.return_date)
      .gt("return_date", body.pickup_date);

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "This vehicle is already booked for those dates." },
        { status: 409 }
      );
    }
  }

  // Baby and child seats share the same back seat. Checked against the merged
  // result rather than the submitted fields alone, so raising one seat type
  // without touching the other still cannot breach the combined limit.
  const seatProblem = await validateSeatTotals(id, body);
  if (seatProblem) return NextResponse.json({ error: seatProblem }, { status: 400 });

  // An untouched date input arrives as ""; Postgres rejects that for a date
  // column just as firmly as it rejects an unknown one.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(body)) update[key] = value === "" ? null : value;

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .update(update)
    .eq("id", id)
    .select("*, vehicles(name, plate, category)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });

  await touchCustomer(data.customer_id ?? body.customer_id);

  // A booking that will never be paid gives its promo use back, so a limited
  // code is not permanently consumed by a rental that did not happen. Redeemed
  // uses are untouched — those were genuinely spent.
  if (typeof body.status === "string" && RELEASES_PROMO.has(body.status) && body.status !== existing.status) {
    const { error: releaseError } = await supabaseAdmin.rpc("promo_release", {
      p_reservation_id: id,
      p_reason: `reservation ${body.status}`,
    });
    if (releaseError) {
      console.error(`[reservations] promo release failed for ${id}:`, releaseError.message);
    }
  }

  let responseData = data;
  if (manualPaymentConfirmation || retryPaidConfirmation) {
    const paidAt = new Date().toISOString();
    const confirmation = await confirmPaidBooking({
      reservationId: id,
      paidAt,
      amountPaid: paymentAmount,
      manuallyVerified: true,
    });
    if (confirmation.outcome === "error") {
      return NextResponse.json({ error: confirmation.error }, { status: 503 });
    }
    if (confirmation.outcome === "not_found") {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }
    if (confirmation.outcome !== "confirmed" && confirmation.outcome !== "already_confirmed") {
      return NextResponse.json({ error: "The payment could not confirm this booking." }, { status: 409 });
    }
    const fullyPaid = Math.abs(paymentAmount - Number(data.total)) < 0.01;
    responseData = {
      ...data,
      status: "confirmed",
      deposit_paid_at: data.deposit_paid_at ?? paidAt,
      balance_due: fullyPaid ? 0 : data.balance_due,
    };
  }

  // Status-change emails to customer
  const prevStatus = existing.status;
  const newStatus = responseData.status;
  if (data.customer_email && prevStatus && prevStatus !== newStatus) {
    try {
      if (newStatus === "active") {
        await sendMail({
          from: "Anadyon Rentals <no-reply@anadyon.gr>",
          to: [data.customer_email],
          subject: "Your vehicle is ready for pick-up — Anadyon Rentals",
          html: buildActiveEmail(data),
        });
      }
    } catch (_) {}
  }

  return NextResponse.json(responseData);
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildActiveEmail(r: Record<string, unknown> & { vehicles?: { name: string } }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1e3a5f">Your Vehicle Is Ready</h2>
      <p>Dear ${esc(r.customer_name)},</p>
      <p>Your vehicle is ready for pick-up today. We look forward to welcoming you!</p>
      <table cellpadding="6" style="border-collapse:collapse;margin:16px 0">
        <tr><td style="color:#666">Vehicle:</td><td><strong>${esc((r.vehicles as { name: string } | undefined)?.name)}</strong></td></tr>
        <tr><td style="color:#666">Pick-up:</td><td>${esc(r.pickup_date)} at ${esc(r.pickup_time)} — ${esc(r.pickup_location)}</td></tr>
        <tr><td style="color:#666">Return:</td><td>${esc(r.return_date)} at ${esc(r.return_time)}</td></tr>
        <tr><td style="color:#666">Balance due:</td><td><strong>€${esc(r.balance_due)}</strong></td></tr>
      </table>
      <p>Please bring a valid driving licence and the balance payment. See you soon!</p>
      <p>Anadyon Rentals</p>
    </div>
  `;
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from("reservations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });
  return NextResponse.json({ ok: true });
}
