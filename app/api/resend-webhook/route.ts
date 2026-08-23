import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";

const ALERT_EVENTS = new Set([
  "email.bounced",
  "email.delivery_delayed",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

const DELIVERY_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

type ResendPayload = {
  type: string;
  created_at?: string;
  data: Record<string, unknown>;
};

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
  let payload: ResendPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
  }
  if (!payload || typeof payload.type !== "string") {
    return NextResponse.json({ error: "Unexpected payload shape" }, { status: 400 });
  }

  return handleEvent(payload, svixId);
}

function deliveryIdFromTags(tags: unknown): string | null {
  if (Array.isArray(tags)) {
    const tag = tags.find((entry) => entry && typeof entry === "object" && (entry as { name?: unknown }).name === "delivery_id");
    const value = tag && typeof (tag as { value?: unknown }).value === "string" ? (tag as { value: string }).value : null;
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  }
  if (tags && typeof tags === "object") {
    const value = (tags as Record<string, unknown>).delivery_id;
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  }
  return null;
}

function eventError(data: Record<string, unknown>): string | null {
  for (const key of ["bounce", "failed", "suppressed"]) {
    const value = data[key];
    if (value == null) continue;
    return (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 1000);
  }
  return null;
}

async function handleEvent(payload: ResendPayload, svixId: string) {
  const { type, data } = payload;

  let deliveryMatched = false;
  let deliveryChanged = false;
  const deliveryId = deliveryIdFromTags(data.tags);
  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  const recipients = Array.isArray(data.to)
    ? data.to.filter((value): value is string => typeof value === "string")
    : typeof data.to === "string" ? [data.to] : [];
  const eventAt = new Date(
    typeof payload.created_at === "string" ? payload.created_at
      : typeof data.created_at === "string" ? data.created_at
        : Date.now(),
  );

  if (DELIVERY_EVENTS.has(type) && deliveryId && emailId && recipients.length && Number.isFinite(eventAt.getTime())) {
    for (const recipient of recipients) {
      const { data: recorded, error } = await supabaseAdmin.rpc("record_booking_email_event", {
        p_delivery_id: deliveryId,
        p_svix_id: svixId,
        p_email_id: emailId,
        p_event_type: type,
        p_event_created_at: eventAt.toISOString(),
        p_recipient: recipient,
        p_error: eventError(data),
      });
      if (error) {
        console.error("[resend-webhook] delivery audit failed:", error.message);
        return NextResponse.json({ error: "Could not record delivery event" }, { status: 503 });
      }
      const result = recorded as { matched?: boolean; changed?: boolean } | null;
      deliveryMatched ||= result?.matched === true;
      deliveryChanged ||= result?.changed === true;
    }
  }

  if (!ALERT_EVENTS.has(type)) {
    return NextResponse.json({ received: true, deliveryMatched });
  }

  const labels: Record<string, string> = {
    "email.bounced": "⚠️ Email Bounced",
    "email.delivery_delayed": "⏳ Email Delivery Delayed",
    "email.complained": "🚩 Spam Complaint",
    "email.failed": "⚠️ Email Failed",
    "email.suppressed": "⛔ Email Suppressed",
  };

  // A retried webhook has already produced its alert. For messages outside
  // the audited booking flow we retain the previous alert behaviour.
  if (deliveryMatched && !deliveryChanged) {
    return NextResponse.json({ received: true, deliveryMatched, duplicate: true });
  }

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

  return NextResponse.json({ received: true, deliveryMatched });
}
