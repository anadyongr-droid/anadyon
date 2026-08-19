import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

const ALERT_EVENTS = new Set([
  "email.bounced",
  "email.delivery_delayed",
  "email.complained",
]);

/**
 * Constant-time comparison.
 *
 * `Array.includes` on the signature list returns as soon as it finds a
 * mismatching byte, which leaks how much of a forged signature was correct.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;

  // Not configured: refuse rather than accept unauthenticated callers. 503
  // rather than 500 — the service is unconfigured, it has not failed.
  if (!signingSecret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set; rejecting");
    return NextResponse.json({ error: "Webhook signing secret not configured" }, { status: 503 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  const body = await req.text();

  // Everything from here to the comparison is attacker-controlled input being
  // fed to decoders that throw. A malformed signature used to escape as an
  // unhandled exception and surface as HTTP 500 — an authentication failure
  // reported as a server fault, which both hides the rejection from monitoring
  // and tells the caller the request reached something that broke.
  let computedSig: string;
  try {
    const secret = signingSecret.replace(/^whsec_/, "");
    const decodedKey = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", decodedKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signed = await crypto.subtle.sign(
      "HMAC", cryptoKey, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`)
    );
    computedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(signed)))}`;
  } catch (err) {
    console.error("[resend-webhook] signature computation failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const presented = svixSignature.split(" ");
  if (!presented.some((sig) => timingSafeEqual(sig, computedSig))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Only now is the payload trusted enough to parse. A body that is signed but
  // not valid JSON is a bad request, not a server error.
  let payload: { type: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
  }
  if (!payload || typeof payload.type !== "string") {
    return NextResponse.json({ error: "Unexpected payload shape" }, { status: 400 });
  }

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

  const esc = (v: unknown) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const to = String(data.to ?? "unknown");
  const subject = String(data.subject ?? "unknown");
  const createdAt = String(data.created_at ?? new Date().toISOString());
  const label = esc(labels[type] ?? type);

  // Routed through the shared wrapper rather than calling Resend directly.
  // This was the last send site that bypassed it, which matters more here than
  // anywhere else: the wrapper is what honours MAIL_REDIRECT_TO, and this
  // endpoint fires on real delivery events, so exercising it against a test
  // environment would have put alerts in the live office inbox.
  await sendMail({
    // Office mailbox only. customerservice@anadyon.gr already forwards to
    // anadyon.gr@gmail.com, so naming both delivered the same alert twice to
    // the same person — one copy direct, one via the forward.
    //
    // Sent from no-reply rather than customerservice, matching the reservation
    // alerts: the recipient is customerservice, and a message addressed from
    // and to the same mailbox is what loop detection exists to notice.
    from: "Anadyon Alerts <no-reply@anadyon.gr>",
    to: ["customerservice@anadyon.gr"],
    subject: `${labels[type]} — ${to}`,
    html: `
      <h2>${label}</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Event:</strong></td><td>${esc(type)}</td></tr>
        <tr><td><strong>To:</strong></td><td>${esc(to)}</td></tr>
        <tr><td><strong>Subject:</strong></td><td>${esc(subject)}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${new Date(createdAt).toLocaleString("en-GB", { timeZone: "Europe/Athens" })}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">Check the <a href="https://resend.com/emails">Resend dashboard</a> for full details.</p>
    `,
  });

  return NextResponse.json({ received: true });
}
