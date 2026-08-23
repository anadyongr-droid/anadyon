import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vehicleLabel } from "@/lib/vehicleLabel";
import { sendMail } from "@/lib/mailer";
import { validateQuoteVehicleAssignment } from "@/lib/quoteVehicleAssignment";
import { confirmPaidBooking } from "@/lib/confirmPaidBooking";
import { validateSeatTotals } from "@/lib/seatLimits";

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


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const quoteRef = searchParams.get("quote_ref");

  let query = supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, plate, category)")
    .order("pickup_date");

  if (from) query = query.gte("pickup_date", from);
  if (to) query = query.lte("return_date", to);
  if (quoteRef) query = query.ilike("notes", `Quote ref: ${quoteRef}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  // Same rule as the PATCH route: underscore-prefixed keys are the form's own
  // state and are not columns.
  const body = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("_") && !["id", "created_at", "source"].includes(k))
  ) as Record<string, unknown> & { total: number; vehicle_id?: string; pickup_date?: string; return_date?: string; customer_id?: string; status?: string };

  // A reservation linked to a quote is a website request, even if a member of
  // staff is completing its allocation. Every other row created here is an
  // office/walk-in reservation. The client cannot choose this classification.
  const source = body.quote_id ? "website" : "admin";
  const createAsPaid = body.status === "confirmed";
  if (createAsPaid && raw._payment_verified !== true) {
    return NextResponse.json(
      { error: "Confirm the booking only after verifying that the deposit or full payment has been received." },
      { status: 400 },
    );
  }
  const paymentAmount = Number(raw._payment_amount);
  if (createAsPaid) {
    const total = Number(body.total);
    const expectedDeposit = Number((total * 0.3).toFixed(2));
    const matchesDeposit = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - expectedDeposit) < 0.01;
    const matchesTotal = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - total) < 0.01;
    if (!matchesDeposit && !matchesTotal) {
      return NextResponse.json(
        { error: `Enter exactly €${expectedDeposit.toFixed(2)} (deposit) or €${total.toFixed(2)} (full payment).` },
        { status: 400 },
      );
    }
  }
  // Insert first as pending, then let the shared idempotent payment path set
  // both status and deposit_paid_at and send the formal confirmation.
  if (createAsPaid) body.status = "pending";

  // Baby and child seats share the same back seat, so the limit is on the two
  // together. Enforced here as well as in the form, because the form is not the
  // integrity boundary.
  const seatProblem = await validateSeatTotals(null, body);
  if (seatProblem) return NextResponse.json({ error: seatProblem }, { status: 400 });

  // The browser restricts its list for quote-origin reservations, but this is
  // the actual integrity boundary. It prevents a stale tab or crafted request
  // assigning a bicycle to a car quote, a lower class without consent, or the
  // wrong transmission.
  const assignmentProblem = await validateQuoteVehicleAssignment(
    typeof body.quote_id === "string" ? body.quote_id : null,
    typeof body.vehicle_id === "string" ? body.vehicle_id : null,
  );
  if (assignmentProblem) {
    return NextResponse.json({ error: assignmentProblem.error }, { status: assignmentProblem.status });
  }

  // Overlap check
  if (body.vehicle_id && body.pickup_date && body.return_date) {
    const { data: conflicts } = await supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("vehicle_id", body.vehicle_id)
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

  const deposit = parseFloat((body.total * 0.3).toFixed(2));
  const balance_due = parseFloat((body.total - deposit).toFixed(2));

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .insert({ ...body, source, deposit, balance_due })
    .select("*, vehicles(name, plate, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });

  await touchCustomer(body.customer_id);

  let responseData = data;
  if (createAsPaid) {
    const paidAt = new Date().toISOString();
    const confirmation = await confirmPaidBooking({
      reservationId: data.id,
      paidAt,
      amountPaid: paymentAmount,
      manuallyVerified: true,
    });
    if (confirmation.outcome === "error") {
      return NextResponse.json({ error: confirmation.error }, { status: 503 });
    }
    if (confirmation.outcome !== "confirmed" && confirmation.outcome !== "already_confirmed") {
      return NextResponse.json({ error: "The payment could not confirm this booking." }, { status: 409 });
    }
    const fullyPaid = Math.abs(paymentAmount - Number(data.total)) < 0.01;
    responseData = { ...data, status: "confirmed", deposit_paid_at: paidAt, balance_due: fullyPaid ? 0 : data.balance_due };
  }

  // Send notification email.
  //
  // Skipped for a reservation created already cancelled or voided: announcing a
  // "New Reservation" for something that is not one is how the office ended up
  // with cancellation emails that read as bookings.
  const announceable = !["cancelled", "voided", "no_show"].includes(String(responseData.status));
  if (announceable) try {
    await sendMail({
      // Was onboarding@resend.dev — Resend's sandbox sender, which only ever
      // delivers to the account owner's own address. Combined with the silent
      // catch below, this staff alert had no way of reporting that it was not
      // arriving. no-reply@ is used elsewhere in the codebase, is covered by the
      // verified send.anadyon.gr setup, and avoids customerservice@ mailing
      // itself, which is what a from/to on the same box would do.
      from: "Anadyon Alerts <no-reply@anadyon.gr>",
      to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
      subject: `New Reservation — ${vehicleLabel(responseData.vehicles)} — ${responseData.customer_name}`,
      html: buildEmailHtml(responseData),
    });
  } catch (err) {
    // A failed notification must not roll back a saved reservation, but it should
    // not vanish either — the previous silent catch is why the sandbox sender
    // went unnoticed.
    console.error("Reservation notification email failed:", err);
  }

  return NextResponse.json(responseData, { status: 201 });
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml(r: Record<string, unknown> & { vehicles?: { name: string } }) {
  const extras: string[] = [];
  if (r.gps) extras.push(`GPS Navigation — €5.00/day`);
  if (Number(r.baby_seat) > 0) extras.push(`Baby Seat ×${r.baby_seat} — €3.00/day each`);
  if (Number(r.child_seat) > 0) extras.push(`Child Seat ×${r.child_seat} — €3.00/day each`);
  if (r.fdw) extras.push(`Full Damage Waiver — €5.00/day`);
  if (Number(r.additional_drivers) > 0) extras.push(`Additional Drivers ×${r.additional_drivers} — €2.50/day each`);

  return `
    <h2>New Reservation</h2>
    <table cellpadding="6" style="border-collapse:collapse;">
      <tr><td><strong>Vehicle:</strong></td><td>${esc(vehicleLabel(r.vehicles as { name: string; plate?: string | null } | undefined))}</td></tr>
      <tr><td><strong>Customer:</strong></td><td>${esc(r.customer_name)}</td></tr>
      <tr><td><strong>Email:</strong></td><td>${esc(r.customer_email ?? "—")}</td></tr>
      <tr><td><strong>Phone:</strong></td><td>${esc(r.customer_phone ?? "—")}</td></tr>
      <tr><td><strong>Pick-up:</strong></td><td>${esc(r.pickup_date)} at ${esc(r.pickup_time)}</td></tr>
      <tr><td><strong>Return:</strong></td><td>${esc(r.return_date)} at ${esc(r.return_time)}</td></tr>
      <tr><td><strong>Days:</strong></td><td>${esc(r.rental_days)}</td></tr>
      <tr><td><strong>Daily rate:</strong></td><td>€${esc(r.daily_rate)}</td></tr>
      <tr><td><strong>Vehicle subtotal:</strong></td><td>€${esc(r.vehicle_subtotal)}</td></tr>
      ${extras.length ? `<tr><td><strong>Extras:</strong></td><td>${extras.join("<br/>")}</td></tr>` : ""}
      <tr><td><strong>Extras subtotal:</strong></td><td>€${esc(r.extras_subtotal)}</td></tr>
      <tr><td><strong>Total:</strong></td><td><strong>€${esc(r.total)}</strong></td></tr>
      <tr><td><strong>Deposit (30%):</strong></td><td>€${esc(r.deposit)}</td></tr>
      <tr><td><strong>Balance due:</strong></td><td>€${esc(r.balance_due)}</td></tr>
      ${r.notes ? `<tr><td><strong>Notes:</strong></td><td>${esc(r.notes)}</td></tr>` : ""}
    </table>
  `;
}
