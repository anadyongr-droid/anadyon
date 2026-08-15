import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import twilio from "twilio";
import { z } from "zod";

const SmsSchema = z.object({
  reservationId: z.string().uuid(),
  template: z.enum(["pickup_reminder", "return_reminder", "confirmation", "custom"]),
  customMessage: z.string().max(500).optional(),
});

const TEMPLATES: Record<string, (r: { customer_name: string; pickup_date: string; return_date: string }) => string> = {
  pickup_reminder: (r) =>
    `Anadyon Rentals: Reminder — your vehicle pickup is tomorrow (${r.pickup_date}). Reply to this message or call +30 6988 010188 if you have questions.`,
  return_reminder: (r) =>
    `Anadyon Rentals: Reminder — your vehicle is due for return tomorrow (${r.return_date}). Call +30 6988 010188 if you need an extension.`,
  confirmation: (r) =>
    `Anadyon Rentals: Your booking is confirmed. Pickup: ${r.pickup_date}. Reply or call +30 6988 010188 for help.`,
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = SmsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { reservationId, template, customMessage } = parsed.data;

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("customer_name, customer_phone, pickup_date, return_date")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (!res.customer_phone) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });

  const message =
    template === "custom"
      ? customMessage ?? ""
      : TEMPLATES[template]?.({
          customer_name: res.customer_name,
          pickup_date: res.pickup_date,
          return_date: res.return_date,
        }) ?? "";

  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
  }

  const client = twilio(accountSid, authToken);
  const sent = await client.messages.create({
    body: message,
    from,
    to: res.customer_phone,
  });

  return NextResponse.json({ ok: true, sid: sent.sid });
}
