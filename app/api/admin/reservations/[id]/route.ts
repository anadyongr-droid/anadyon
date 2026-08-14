import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, category)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

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

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, vehicles(name, category)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status-change emails to customer
  const prevStatus = body._prev_status;
  const newStatus = data.status;
  if (data.customer_email && prevStatus && prevStatus !== newStatus) {
    try {
      if (newStatus === "confirmed") {
        await resend.emails.send({
          from: "Anadyon Rentals <no-reply@anadyon.gr>",
          to: [data.customer_email],
          subject: "Your reservation is confirmed — Anadyon Rentals",
          html: buildConfirmedEmail(data),
        });
      } else if (newStatus === "active") {
        await resend.emails.send({
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

function buildConfirmedEmail(r: Record<string, unknown> & { vehicles?: { name: string } }) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1e3a5f">Reservation Confirmed</h2>
      <p>Dear ${r.customer_name},</p>
      <p>Your reservation with Anadyon Rentals is confirmed. Please arrange your deposit payment to secure your booking.</p>
      <table cellpadding="6" style="border-collapse:collapse;margin:16px 0">
        <tr><td style="color:#666">Vehicle:</td><td><strong>${(r.vehicles as { name: string } | undefined)?.name ?? ""}</strong></td></tr>
        <tr><td style="color:#666">Pick-up:</td><td>${r.pickup_date} at ${r.pickup_time} — ${r.pickup_location}</td></tr>
        <tr><td style="color:#666">Return:</td><td>${r.return_date} at ${r.return_time}</td></tr>
        <tr><td style="color:#666">Total:</td><td><strong>€${r.total}</strong></td></tr>
        <tr><td style="color:#666">Deposit (30%):</td><td>€${r.deposit}</td></tr>
        <tr><td style="color:#666">Balance at pick-up:</td><td>€${r.balance_due}</td></tr>
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
      <p>Dear ${r.customer_name},</p>
      <p>Your vehicle is ready for pick-up today. We look forward to welcoming you!</p>
      <table cellpadding="6" style="border-collapse:collapse;margin:16px 0">
        <tr><td style="color:#666">Vehicle:</td><td><strong>${(r.vehicles as { name: string } | undefined)?.name ?? ""}</strong></td></tr>
        <tr><td style="color:#666">Pick-up:</td><td>${r.pickup_date} at ${r.pickup_time} — ${r.pickup_location}</td></tr>
        <tr><td style="color:#666">Return:</td><td>${r.return_date} at ${r.return_time}</td></tr>
        <tr><td style="color:#666">Balance due:</td><td><strong>€${r.balance_due}</strong></td></tr>
      </table>
      <p>Please bring a valid driving licence and the balance payment. See you soon!</p>
      <p>Anadyon Rentals</p>
    </div>
  `;
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from("reservations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
