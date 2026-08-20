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
  replyTo?: string;
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
    return { ...mail, to: [REDIRECT], subject: `[TEST → ${to.join(", ")}] ${mail.subject}` };
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
async function attempt(mail: Mail): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const sent = await Promise.race([
      resend.emails.send(addressed(mail) as Parameters<typeof resend.emails.send>[0]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer within ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
    ]);
    if (sent && typeof sent === "object" && "error" in sent && sent.error) {
      const e = sent.error as { message?: string; name?: string };
      return { ok: false, reason: e.message ?? e.name ?? "Resend returned an error" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err).slice(0, 200) };
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
export async function sendMail(mail: Mail): Promise<SendResult> {
  const result = await attempt(mail);
  if (result.ok) return { ok: true, queued: false };

  const to = Array.isArray(mail.to) ? mail.to.join(", ") : mail.to;
  console.error(`[mail] could not send "${mail.subject}" to ${to}: ${result.reason}`);

  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    await supabaseAdmin.from("alert_outbox").insert({
      key: `${QUEUE_PREFIX}${randomUUID()}`,
      payload: JSON.stringify(mail),
      error: result.reason,
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
    try {
      mail = JSON.parse(row.payload as string) as Mail;
    } catch {
      // Unparseable payload will never send; retiring it stops an infinite retry.
      await supabaseAdmin.from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: "abandoned: payload is not valid JSON" })
        .eq("id", row.id);
      out.abandoned++;
      continue;
    }

    const res = await attempt(mail);
    if (res.ok) {
      await supabaseAdmin.from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      out.sent++;
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
}

/** True when mail is being diverted, so callers can say so in their response. */
export const mailIsRedirected = Boolean(REDIRECT);
