import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_EVENTS = new Set([
  "email.bounced",
  "email.delivery_delayed",
  "email.complained",
]);

export async function POST(req: NextRequest) {
  // Verify the webhook signature using Resend's signing secret
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (signingSecret) {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }

    const body = await req.text();

    // Verify: HMAC-SHA256 of "svix-id.svix-timestamp.body" against signing secret
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingSecret.replace(/^whsec_/, ""));
    const decodedKey = Uint8Array.from(atob(new TextDecoder().decode(keyData)), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", decodedKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signedData = encoder.encode(`${svixId}.${svixTimestamp}.${body}`);
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, signedData);
    const computedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
    const expectedSigs = svixSignature.split(" ");
    if (!expectedSigs.includes(computedSig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);
    return handleEvent(payload);
  }

  // No signing secret configured — process without verification (not recommended for production)
  const payload = await req.json();
  return handleEvent(payload);
}

async function handleEvent(payload: { type: string; data: Record<string, unknown> }) {
  const { type, data } = payload;

  if (!ALERT_EVENTS.has(type)) {
    return NextResponse.json({ received: true });
  }

  const labels: Record<string, string> = {
    "email.bounced": "⚠️ Email Bounced",
    "email.delivery_delayed": "⏳ Email Delivery Delayed",
    "email.complained": "🚩 Spam Complaint",
  };

  const to = String(data.to ?? "unknown");
  const subject = String(data.subject ?? "unknown");
  const createdAt = String(data.created_at ?? new Date().toISOString());

  await resend.emails.send({
    from: "Anadyon Alerts <customerservice@anadyon.gr>",
    to: ["anadyon.gr@gmail.com"],
    subject: `${labels[type]} — ${to}`,
    html: `
      <h2>${labels[type]}</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Event:</strong></td><td>${type}</td></tr>
        <tr><td><strong>To:</strong></td><td>${to}</td></tr>
        <tr><td><strong>Subject:</strong></td><td>${subject}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${new Date(createdAt).toLocaleString("en-GB", { timeZone: "Europe/Athens" })}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">Check the <a href="https://resend.com/emails">Resend dashboard</a> for full details.</p>
    `,
  });

  return NextResponse.json({ received: true });
}
