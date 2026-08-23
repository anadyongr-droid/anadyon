import { randomUUID } from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * When MAIL_REDIRECT_TO is set, every message is delivered to that one address
 * instead of its real recipients, which are named in the subject line.
 *
 * It exists so the booking flow can be exercised end to end — including the
 * real Resend call — without a test reservation arriving in the office inbox
 * looking like a genuine one. The variable is unset in production, where this
 * wrapper does nothing but forward to Resend.
 */
const REDIRECT = process.env.MAIL_REDIRECT_TO?.trim();

export interface Mail {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  tags?: Array<{ name: string; value: string }>;
}

export interface SendOptions {
  /** Resend keeps this key for 24 hours and will not create a duplicate send. */
  idempotencyKey?: string;
  /** Optional application audit row updated on immediate send and queued retry. */
  deliveryId?: string;
}

/** Prefix marking a queued message. Shares alert_outbox; see lib/telegram.ts. */
const QUEUE_PREFIX = "email:";

/** Bounds one Resend call. A booking confirmation is not worth a hung request. */
const TIMEOUT_MS = 8000;

/** Stops retrying. A three-day-old booking confirmation is not worth sending. */
const GIVE_UP_AFTER_MS = 72 * 60 * 60 * 1000;

/** Applies the test redirect, so queued and live mail go through one path. */
function addressed(mail: Mail): Mail {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (REDIRECT) {
    // A test redirect must cover every recipient class. Leaving cc/bcc intact
    // would silently copy a Preview test to a real office or customer address.
    const { cc: _cc, bcc: _bcc, ...safe } = mail;
    return { ...safe, to: [REDIRECT], subject: `[TEST → ${to.join(", ")}] ${mail.subject}` };
  }
  return { ...mail, to };
}

/**
 * One attempt, bounded and actually checked.
 *
 * resend.emails.send() resolves with { data, error } rather than throwing, so
 * the previous `return resend.emails.send(...)` reported success for a rejected
 * domain, a rate limit and an invalid recipient alike. The booking route sailed
 * past all three and handed the customer a reference for an email that was
 * never sent.
 */
async function attempt(
  mail: Mail,
  options: SendOptions = {},
): Promise<{ ok: true; providerMessageId: string } | { ok: false; reason: string }> {
  try {
    const sent = await Promise.race([
      resend.emails.send(
        addressed(mail) as Parameters<typeof resend.emails.send>[0],
        options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
      ),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer within ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
    ]);
    if (sent && typeof sent === "object" && "error" in sent && sent.error) {
      const e = sent.error as { message?: string; name?: string };
      return { ok: false, reason: e.message ?? e.name ?? "Resend returned an error" };
    }
    const providerMessageId = sent?.data?.id;
    if (!providerMessageId) return { ok: false, reason: "Resend accepted the request without returning an email ID" };
    return { ok: true, providerMessageId };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err).slice(0, 200) };
  }
}

async function updateDelivery(
  deliveryId: string | undefined,
  values: Record<string, unknown>,
): Promise<void> {
  if (!deliveryId) return;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    let query = supabaseAdmin
      .from("booking_email_deliveries")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", deliveryId);
    // A delivery webhook can beat the HTTP response from Resend. Never let the
    // slower sender path regress Delivered/Bounced/etc. back to Accepted.
    if (values.status === "accepted") query = query.in("status", ["pending", "queued"]);
    else if (values.status === "queued") query = query.eq("status", "pending");
    else if (values.status === "failed") query = query.in("status", ["pending", "queued"]);
    const { error } = await query;
    if (error) console.error(`[mail] could not update delivery ${deliveryId}: ${error.message}`);
  } catch (err) {
    console.error(`[mail] could not update delivery ${deliveryId}:`, err);
  }
}

/**
 * Sends a message, and never loses one.
 *
 * A failure is written to alert_outbox for the daily cron to retry, and the
 * office is told immediately over Telegram — because for a booking
 * confirmation a retry tomorrow is not a fix, it is a record. What the office
 * actually needs is to know now that a customer is holding a reference and
 * waiting for an email that did not arrive.
 *
 * Never throws. The booking is already stored by the time this is called, and
 * failing the customer's request over a mail problem would turn a delivered
 * booking into an apparent error and invite a duplicate submission.
 */
export async function sendMail(mail: Mail, options: SendOptions = {}): Promise<SendResult> {
  const result = await attempt(mail, options);
  if (result.ok) {
    await updateDelivery(options.deliveryId, {
      status: "accepted",
      provider_message_id: result.providerMessageId,
      accepted_at: new Date().toISOString(),
      last_error: null,
    });
    return { ok: true, queued: false, providerMessageId: result.providerMessageId };
  }

  const to = Array.isArray(mail.to) ? mail.to.join(", ") : mail.to;
  console.error(`[mail] could not send "${mail.subject}" to ${to}: ${result.reason}`);

  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { error } = await supabaseAdmin.from("alert_outbox").insert({
      key: `${QUEUE_PREFIX}${randomUUID()}`,
      payload: JSON.stringify({ version: 2, mail, options }),
      error: result.reason,
    });
    if (error) throw new Error(error.message);
    await updateDelivery(options.deliveryId, {
      status: "queued",
      last_error: result.reason,
    });
    const { sendTelegram } = await import("@/lib/telegram");
    await sendTelegram(
      `📧 <b>Email could not be sent</b>\nTo: ${to}\nSubject: ${mail.subject}\n` +
      `Reason: ${result.reason}\nQueued for retry — contact the customer directly if it was a confirmation.`
    );
  } catch (err) {
    // Neither sent nor stored. The only case where the message is genuinely
    // lost, and the only one where a caller should tell the sender to retry.
    console.error("[mail] and could not queue it either:", err);
    await updateDelivery(options.deliveryId, { status: "failed", last_error: result.reason });
    return { ok: false, queued: false, reason: result.reason };
  }
  return { ok: false, queued: true, reason: result.reason };
}

/**
 * Retries queued mail. Called by the daily cron.
 *
 * Ordered oldest first and capped so a backlog drains in order without
 * blowing the cron's budget.
 */
export async function drainMailQueue(limit = 15): Promise<{ sent: number; failed: number; abandoned: number }> {
  const out = { sent: 0, failed: 0, abandoned: 0 };
  const { supabaseAdmin } = await import("@/lib/supabase");

  const { data: pending, error } = await supabaseAdmin
    .from("alert_outbox")
    .select("id, payload, created_at")
    .like("key", `${QUEUE_PREFIX}%`)
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[mail] could not read the queue:", error.message);
    return out;
  }

  for (const row of pending ?? []) {
    const age = Date.now() - new Date(row.created_at as string).getTime();
    if (age > GIVE_UP_AFTER_MS) {
      await supabaseAdmin.from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: "abandoned: undeliverable for 72h" })
        .eq("id", row.id);
      out.abandoned++;
      continue;
    }

    let mail: Mail;
    let options: SendOptions = {};
    try {
      const stored = JSON.parse(row.payload as string) as Mail | { version: 2; mail: Mail; options?: SendOptions };
      if (stored && typeof stored === "object" && "version" in stored && stored.version === 2) {
        mail = stored.mail;
        options = stored.options ?? {};
      } else {
        // Backwards compatible with messages queued before delivery auditing.
        mail = stored as Mail;
      }
    } catch {
      // Unparseable payload will never send; retiring it stops an infinite retry.
      await supabaseAdmin.from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: "abandoned: payload is not valid JSON" })
        .eq("id", row.id);
      out.abandoned++;
      continue;
    }

    const res = await attempt(mail, options);
    if (res.ok) {
      await supabaseAdmin.from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      out.sent++;
      await updateDelivery(options.deliveryId, {
        status: "accepted",
        provider_message_id: res.providerMessageId,
        accepted_at: new Date().toISOString(),
        last_error: null,
      });
    } else {
      await supabaseAdmin.from("alert_outbox").update({ error: res.reason }).eq("id", row.id);
      out.failed++;
    }
  }

  return out;
}

/**
 * What happened to a message.
 *
 * `ok` means delivered. `queued` means not delivered but safely stored and it
 * will be retried — which for a caller deciding what to tell a person is the
 * distinction that matters: a queued message has been received, so asking them
 * to send it again would only produce a duplicate. Only `!ok && !queued` means
 * the message is actually lost.
 */
export interface SendResult {
  ok: boolean;
  queued: boolean;
  reason?: string;
  providerMessageId?: string;
}

/** True when mail is being diverted, so callers can say so in their response. */
export const mailIsRedirected = Boolean(REDIRECT);

/** Actual primary recipient after the Preview safety redirect is applied. */
export const mailRedirectTarget = REDIRECT || null;
