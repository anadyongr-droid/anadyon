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
      from: "Anadyon Admin <onboarding@resend.dev>",
      to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
      subject: `New Reservation — ${data.vehicles?.name} — ${data.customer_name}`,
      html: buildEmailHtml(data),
    });
  } catch (_) {
    // Email failure should not block the reservation
  }

  return NextResponse.json(data, { status: 201 });
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
      <tr><td><strong>Vehicle:</strong></td><td>${(r.vehicles as { name: string } | undefined)?.name ?? ""}</td></tr>
      <tr><td><strong>Customer:</strong></td><td>${r.customer_name}</td></tr>
      <tr><td><strong>Email:</strong></td><td>${r.customer_email ?? "—"}</td></tr>
      <tr><td><strong>Phone:</strong></td><td>${r.customer_phone ?? "—"}</td></tr>
      <tr><td><strong>Pick-up:</strong></td><td>${r.pickup_date} at ${r.pickup_time}</td></tr>
      <tr><td><strong>Return:</strong></td><td>${r.return_date} at ${r.return_time}</td></tr>
      <tr><td><strong>Days:</strong></td><td>${r.rental_days}</td></tr>
      <tr><td><strong>Daily rate:</strong></td><td>€${r.daily_rate}</td></tr>
      <tr><td><strong>Vehicle subtotal:</strong></td><td>€${r.vehicle_subtotal}</td></tr>
      ${extras.length ? `<tr><td><strong>Extras:</strong></td><td>${extras.join("<br/>")}</td></tr>` : ""}
      <tr><td><strong>Extras subtotal:</strong></td><td>€${r.extras_subtotal}</td></tr>
      <tr><td><strong>Total:</strong></td><td><strong>€${r.total}</strong></td></tr>
      <tr><td><strong>Deposit (30%):</strong></td><td>€${r.deposit}</td></tr>
      <tr><td><strong>Balance due:</strong></td><td>€${r.balance_due}</td></tr>
      ${r.notes ? `<tr><td><strong>Notes:</strong></td><td>${r.notes}</td></tr>` : ""}
    </table>
  `;
}
