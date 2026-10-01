import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import twilio from "twilio";
import { z } from "zod";

/**
 * How long to wait on Twilio before giving up.
 *
 * Matches the 8 seconds `proxy.ts` allows the Supabase auth call — the figure
 * that came out of the August 2026 admin outage, where an unbounded call on a
 * slow day took the whole admin down. A staff member watching the Send button
 * will not wait longer than this either.
 */
const SMS_TIMEOUT_MS = 8_000;

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
    .select("customer_name, customer_phone, pickup_date, return_date, status, deposit_paid_at")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (!res.customer_phone) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });
  if (template === "confirmation" && (res.status !== "confirmed" || !res.deposit_paid_at)) {
    return NextResponse.json(
      { error: "A booking-confirmation SMS can be sent only after payment has been verified." },
      { status: 409 },
    );
  }

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

  // Bounded, because §5.3 requires every external call to carry a timeout and
  // this one carried none. `RequestClient`'s `timeout` is the socket timeout as
  // well as the request timeout, so this closes the connection rather than only
  // giving up on waiting for it.
  const client = twilio(accountSid, authToken, {
    httpClient: new twilio.RequestClient({ timeout: SMS_TIMEOUT_MS }),
  });

  try {
    const sent = await client.messages.create({
      body: message,
      from,
      to: res.customer_phone,
    });
    return NextResponse.json({ ok: true, sid: sent.sid });
  } catch (err) {
    // This `catch` is the whole point of the change. The call was previously
    // awaited bare, so a Twilio failure was an unhandled rejection: the caller
    // got a framework 500 whose body is HTML, the admin's `res.json()` threw on
    // it in turn, and the button sat on "Sending…" for ever. Nothing anywhere
    // said the message had not gone.
    const detail = err instanceof Error ? err.message : "the provider did not respond";
    console.error("[sms] send failed", { reservationId, template, detail });
    return NextResponse.json(
      // Phrased for the person reading it beside the Send button: what they need
      // to know is that the customer did not get it, not which SDK threw.
      { error: `Not sent — ${detail}. The customer has not received this message.` },
      { status: 502 },
    );
  }
}
