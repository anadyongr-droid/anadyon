import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Resend } from "resend";

async function touchCustomer(customerId: string | null | undefined) {
  if (!customerId) return;
  await supabaseAdmin
    .from("customers")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("id", customerId);
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const quoteRef = searchParams.get("quote_ref");

  let query = supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, category)")
    .order("pickup_date");

  if (from) query = query.gte("pickup_date", from);
  if (to) query = query.lte("return_date", to);
  if (quoteRef) query = query.ilike("notes", `Quote ref: ${quoteRef}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

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
    .insert({ ...body, deposit, balance_due })
    .select("*, vehicles(name, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await touchCustomer(body.customer_id);

  // Send notification email
  try {
    await resend.emails.send({
      // Was onboarding@resend.dev — Resend's sandbox sender, which only ever
      // delivers to the account owner's own address. Combined with the silent
      // catch below, this staff alert had no way of reporting that it was not
      // arriving. no-reply@ is used elsewhere in the codebase, is covered by the
      // verified send.anadyon.gr setup, and avoids customerservice@ mailing
      // itself, which is what a from/to on the same box would do.
      from: "Anadyon Alerts <no-reply@anadyon.gr>",
      to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
      subject: `New Reservation — ${data.vehicles?.name} — ${data.customer_name}`,
      html: buildEmailHtml(data),
    });
  } catch (err) {
    // A failed notification must not roll back a saved reservation, but it should
    // not vanish either — the previous silent catch is why the sandbox sender
    // went unnoticed.
    console.error("Reservation notification email failed:", err);
  }

  return NextResponse.json(data, { status: 201 });
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
      <tr><td><strong>Vehicle:</strong></td><td>${esc((r.vehicles as { name: string } | undefined)?.name)}</td></tr>
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
