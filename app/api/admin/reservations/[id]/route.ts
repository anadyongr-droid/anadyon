import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";

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

  // `_prev_status` is sent by the form so this route can tell what changed and
  // email accordingly. It is not a column, and spreading the whole body into the
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
  // column: `_prev_status` tells this route what changed, `_daily_rate_override`
  // holds a rate the operator typed. Naming them one by one meant the next one
  // added broke every save with a 400 until someone noticed — a rule does not
  // need updating.
  const prevStatusFromClient = raw._prev_status as string | undefined;
  const body = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("_") && k !== "id" && k !== "created_at")
  );

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

  // Status-change emails to customer
  const prevStatus = prevStatusFromClient;
  const newStatus = data.status;
  if (data.customer_email && prevStatus && prevStatus !== newStatus) {
    try {
      if (newStatus === "confirmed") {
        await sendMail({
          from: "Anadyon Rentals <no-reply@anadyon.gr>",
          to: [data.customer_email],
          subject: "Your reservation is confirmed — Anadyon Rentals",
          html: buildConfirmedEmail(data),
        });
      } else if (newStatus === "active") {
        await sendMail({
          from: "Anadyon Rentals <no-reply@anadyon.gr>",
          to: [data.customer_email],
          subject: "Your vehicle is ready for pick-up — Anadyon Rentals",
          html: buildActiveEmail(data),
        });
      }
    } catch (_) {}
  }

  return NextResponse.json(data);
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildConfirmedEmail(r: Record<string, unknown> & { vehicles?: { name: string } }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1e3a5f">Reservation Confirmed</h2>
      <p>Dear ${esc(r.customer_name)},</p>
      <p>Your reservation with Anadyon Rentals is confirmed. Please arrange your deposit payment to secure your booking.</p>
      <table cellpadding="6" style="border-collapse:collapse;margin:16px 0">
        <tr><td style="color:#666">Vehicle:</td><td><strong>${esc((r.vehicles as { name: string } | undefined)?.name)}</strong></td></tr>
        <tr><td style="color:#666">Pick-up:</td><td>${esc(r.pickup_date)} at ${esc(r.pickup_time)} — ${esc(r.pickup_location)}</td></tr>
        <tr><td style="color:#666">Return:</td><td>${esc(r.return_date)} at ${esc(r.return_time)}</td></tr>
        <tr><td style="color:#666">Total:</td><td><strong>€${esc(r.total)}</strong></td></tr>
        <tr><td style="color:#666">Deposit (30%):</td><td>€${esc(r.deposit)}</td></tr>
        <tr><td style="color:#666">Balance at pick-up:</td><td>€${esc(r.balance_due)}</td></tr>
      </table>
      <p>To pay your deposit, please contact us at <a href="mailto:customerservice@anadyon.gr">customerservice@anadyon.gr</a> or call us directly.</p>
      <p>Thank you for choosing Anadyon Rentals!</p>
    </div>
  `;
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
