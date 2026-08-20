/**
 * Telegram alerts, with somewhere for a failed one to go.
 *
 * Every alert this system raises — a deposit received, a booking that could
 * not be stored, a nightly health check — goes out through here, and this
 * function used to drop all of them on the floor. Three separate ways:
 *
 *   No timeout. An unresponsive api.telegram.org held a serverless invocation
 *   open until the platform killed it. On the Stripe webhook that turns a
 *   successful payment into a timeout, and Stripe then retries a payment that
 *   was in fact recorded.
 *
 *   No check of the answer. `await fetch(...)` resolves for a 401, a 429 and a
 *   500 alike, and Telegram also answers 200 with `{"ok": false}` for things
 *   like a bad chat id. Every one of those looked like a delivered message.
 *
 *   Nowhere to put a failure. The catch logged to a console nobody reads, and
 *   the alert was gone. The failures that matter most are exactly the ones
 *   raised while something else is already wrong.
 *
 * So: bounded, checked, and on failure written to alert_outbox to be retried
 * by the daily cron. An alert that cannot be delivered now is not lost, it is
 * late — and a late alert about a payment is worth a great deal more than no
 * alert at all.
 */

import { randomUUID } from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "-1003920236402";

/** Long enough for a slow answer, short enough not to hold a webhook open. */
const TIMEOUT_MS = 5000;

/**
 * Prefix marking a row as a queued Telegram message.
 *
 * alert_outbox is shared. Production currently holds `briefing:<date>`,
 * `watchdog:thread:…` and `urgent:…` rows, plus the Stripe webhook's event
 * claims. Those rows also sit with sent_at null — a Stripe claim does, by
 * design, between claiming an event and finishing it — so draining on
 * sent_at alone would post their payloads to the staff channel as if they
 * were alerts.
 *
 * Matching `tg:` is an allowlist rather than a list of things to skip, and
 * that is the point: `urgent:` was already there in twenty rows and is not
 * written by any code path considered when this was designed. A denylist
 * would have had to be right about every prefix that exists now and every one
 * added later. This one only has to be right about its own.
 */
const QUEUE_PREFIX = "tg:";

/** Stops retrying. A two-day-old alert is history, not news. */
const GIVE_UP_AFTER_MS = 48 * 60 * 60 * 1000;

/** Bounded, and honest about what Telegram actually answered. */
async function deliver(message: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // Telegram puts the real reason in the body, and it is usually specific
      // enough to fix ("chat not found", "bot was blocked by the user").
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `HTTP ${res.status} ${detail.slice(0, 200)}`.trim() };
    }

    // A 200 is not a delivery. Telegram signals application-level failure in
    // the body while still answering 200.
    const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (body?.ok !== true) {
      return { ok: false, reason: body?.description ?? "Telegram answered ok:false" };
    }

    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError"
      ? `no answer within ${TIMEOUT_MS}ms`
      : String(err).slice(0, 200);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Parks an undelivered message for the cron to retry. */
async function queue(message: string, reason: string): Promise<void> {
  try {
    // Imported lazily so this module stays usable from contexts that have no
    // database — and so importing it never drags the Supabase client in.
    const { supabaseAdmin } = await import("@/lib/supabase");
    await supabaseAdmin.from("alert_outbox").insert({
      key: `${QUEUE_PREFIX}${randomUUID()}`,
      payload: message,
      error: reason,
    });
    console.warn(`[telegram] undelivered (${reason}) — queued for retry`);
  } catch (err) {
    // The last resort. If the alert cannot be sent and cannot be stored, the
    // log is all that is left.
    console.error(`[telegram] undelivered (${reason}) and could not queue:`, err);
  }
}

export async function sendTelegram(message: string): Promise<void> {
  if (!BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not set — skipping Telegram alert");
    return;
  }
  const result = await deliver(message);
  if (!result.ok) await queue(message, result.reason);
}

/**
 * Retries queued messages. Called by the daily cron.
 *
 * The cron's cadence is the backoff: once a day, up to two days, then the row
 * is marked abandoned so it stops being retried forever. That is deliberately
 * coarse — a finer schedule would need an attempts column, and a daily alert
 * channel does not warrant a migration to retry it hourly.
 *
 * Ordered oldest first and capped, so a backlog drains in order and cannot
 * itself blow the cron's time budget.
 */
export async function drainTelegramQueue(limit = 20): Promise<{ sent: number; failed: number; abandoned: number }> {
  const result = { sent: 0, failed: 0, abandoned: 0 };
  if (!BOT_TOKEN) return result;

  const { supabaseAdmin } = await import("@/lib/supabase");
  const { data: pending, error } = await supabaseAdmin
    .from("alert_outbox")
    .select("id, payload, created_at")
    .like("key", `${QUEUE_PREFIX}%`)
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[telegram] could not read the queue:", error.message);
    return result;
  }

  for (const row of pending ?? []) {
    const age = Date.now() - new Date(row.created_at as string).getTime();
    if (age > GIVE_UP_AFTER_MS) {
      // Marked sent so it leaves the queue, with the reason recorded — the row
      // stays as evidence that an alert was raised and never got through.
      await supabaseAdmin
        .from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: "abandoned: undeliverable for 48h" })
        .eq("id", row.id);
      result.abandoned++;
      continue;
    }

    const attempt = await deliver(row.payload as string);
    if (attempt.ok) {
      await supabaseAdmin
        .from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      result.sent++;
    } else {
      await supabaseAdmin.from("alert_outbox").update({ error: attempt.reason }).eq("id", row.id);
      result.failed++;
    }
  }

  return result;
}
