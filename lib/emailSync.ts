import { fetchNewEmails, advanceSyncCursor, fetchRepliedThreadIds } from "@/lib/gmail";
import { classifyEmail } from "@/lib/emailClassifier";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export interface SyncResult {
  fetched: number;
  inserted: number;
  alerted: number;
  /** Messages left for the next run when a backlog exceeds one batch. */
  remaining: number;
  /** True when the run stopped on its own deadline rather than finishing. */
  stoppedEarly: boolean;
}

export interface SyncOptions {
  /**
   * When to stop starting new messages.
   *
   * Must be comfortably below whatever timeout the caller races this against.
   * The point is for the loop to reach its own end and save its progress,
   * rather than being abandoned mid-flight — see the cursor note below.
   */
  budgetMs?: number;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Saves progress after every message, rather than once at the end.
 *
 * The cursor used to be written on the final line of syncEmails. That line was
 * never reached: the cron races this call against a timeout, and when the race
 * fires it stops *waiting* — it cannot cancel the work. Vercel then freezes the
 * instance once the response is sent, so the pending write was discarded.
 *
 * The evidence was unambiguous. gmail_last_sync sat at 2026-08-18T04:11:26 for
 * two full days while messages received on 18 August were being stored on the
 * 19th and the 20th. Every run re-fetched the same widening window from a
 * cursor that could never move, re-checked every message in it, and paid for a
 * classification on anything new before running out of time again.
 *
 * An upsert of one row per message is a small price for progress that survives
 * being interrupted. It is also monotonic by construction here, because the
 * batch is handed to us oldest-first.
 */
async function advanceCursor(upTo: Date): Promise<void> {
  try {
    await advanceSyncCursor(upTo);
  } catch (err) {
    // Not fatal: the next run re-reads the same window and skips what is
    // already stored. Losing the cursor costs time, not correctness.
    console.error("[emailSync] could not save the sync cursor:", err);
  }
}

/**
 * Pulls new mail from Gmail, classifies it, stores it, and raises a Telegram
 * alert for anything urgent.
 *
 * Shared by the scheduled cron, the daily briefing, and the manual "Sync now"
 * button so all three behave identically. Safe to call repeatedly: messages
 * already stored are skipped by gmail_message_id, and Telegram alerts are
 * de-duplicated through alert_outbox.
 */
export async function syncEmails(options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 20_000;

  const { emails, remaining } = await fetchNewEmails();
  let inserted = 0;
  let alerted = 0;
  let stoppedEarly = false;

  // One query instead of one per message. Twelve round trips to check twelve
  // ids was a meaningful slice of the budget, and on a backlog almost all of
  // them return "already stored" — the cheap case was costing the most.
  const seen = new Set<string>();
  if (emails.length) {
    const { data: known } = await supabaseAdmin
      .from("emails")
      .select("gmail_message_id")
      .in("gmail_message_id", emails.map((e) => e.gmailMessageId));
    for (const row of known ?? []) seen.add(row.gmail_message_id as string);
  }

  for (const email of emails) {
    // Stop on our own terms while there is still time to record where we got
    // to. Being cut off by the caller's timeout instead is what stalled this
    // sync for two days: see advanceCursor below.
    if (Date.now() - startedAt > budgetMs) {
      stoppedEarly = true;
      console.warn(`[emailSync] stopping at ${inserted} stored — ${budgetMs}ms budget spent`);
      break;
    }

    try {
      if (seen.has(email.gmailMessageId)) {
        await advanceCursor(email.receivedAt);
        continue;
      }

      const classification = await classifyEmail(email.subject, email.bodyText, email.senderEmail);

      // Attempt to link to a known customer
      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("id")
        .ilike("email", email.senderEmail)
        .maybeSingle();

      const { data: row, error } = await supabaseAdmin
        .from("emails")
        .insert({
          gmail_message_id: email.gmailMessageId,
          gmail_thread_id: email.gmailThreadId,
          sender_name: email.senderName,
          sender_email: email.senderEmail,
          subject: email.subject,
          body_text: email.bodyText?.slice(0, 20000),
          received_at: email.receivedAt.toISOString(),
          category: classification?.category ?? null,
          greek_summary: classification?.greek_summary ?? null,
          urgency: classification?.urgency ?? 2,
          reservation_date: classification?.reservation_date ?? null,
          suggested_action: classification?.suggested_action ?? null,
          customer_id: customer?.id ?? null,
          status: "open",
        })
        .select("id, urgency, subject, sender_email, greek_summary")
        .single();

      if (error) {
        console.error("Email insert failed", email.gmailMessageId, error.message);
        // Do not advance the cursor past a message we failed to store.
        break;
      }

      inserted++;
      await advanceCursor(email.receivedAt);

      // Mirror the Make.com scenario: a cancellation closes earlier open mail
      // in the same thread, so the Inbox does not keep showing a dead booking.
      if (classification?.category === "Cancellation") {
        await supabaseAdmin
          .from("emails")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("gmail_thread_id", email.gmailThreadId)
          .neq("id", row.id)
          .eq("status", "open");
      }

      // Alert Telegram immediately for high-urgency emails
      if ((row.urgency ?? 2) >= 3) {
        const alertKey = `urgent:email:${row.id}`;
        const { data: outbox } = await supabaseAdmin
          .from("alert_outbox")
          .select("id")
          .eq("key", alertKey)
          .maybeSingle();

        if (!outbox) {
          const msg =
            `🔴 <b>ΑΜΕΣΗ ΠΡΟΣΟΧΗ</b>\n` +
            `Από: ${esc(email.senderName ?? email.senderEmail)} (${esc(email.senderEmail)})\n` +
            `Θέμα: ${esc(email.subject ?? "(χωρίς θέμα)")}\n` +
            `Κατηγορία: ${esc(classification?.category ?? "-")}\n` +
            `Επείγον: ${esc(row.urgency ?? 2)}\n` +
            `Περίληψη: ${esc(row.greek_summary ?? "-")}\n` +
            `Ημ. Κράτησης: ${esc(classification?.reservation_date ?? "-")}\n` +
            `Ενέργεια: ${esc(classification?.suggested_action ?? "-")}`;
          await sendTelegram(msg);
          await supabaseAdmin.from("alert_outbox").insert({
            key: alertKey,
            payload: msg,
            sent_at: new Date().toISOString(),
          });
          alerted++;
        }
      }
    } catch (err) {
      console.error("Email sync failed for", email.gmailMessageId, err);
      break; // leave the cursor where it is so this message is retried
    }
  }

  return { fetched: emails.length, inserted, alerted, remaining, stoppedEarly };
}

/**
 * Marks open emails as replied once staff have answered the thread from Gmail.
 *
 * Replaces the Make.com "Reply Detection" scenario. Matching is by Gmail thread
 * id, so replying from any device or client counts — nothing has to be clicked
 * in the admin panel.
 */
export async function detectReplies(): Promise<{ checked: number; replied: number }> {
  const { data: open } = await supabaseAdmin
    .from("emails")
    .select("id, gmail_thread_id")
    .eq("status", "open");

  if (!open?.length) return { checked: 0, replied: 0 };

  const repliedThreads = await fetchRepliedThreadIds();
  if (!repliedThreads.size) return { checked: open.length, replied: 0 };

  const answered = open.filter(e => e.gmail_thread_id && repliedThreads.has(e.gmail_thread_id));
  if (!answered.length) return { checked: open.length, replied: 0 };

  const { error } = await supabaseAdmin
    .from("emails")
    .update({ status: "replied", updated_at: new Date().toISOString() })
    .in("id", answered.map(e => e.id));

  if (error) {
    console.error("detectReplies update failed", error.message);
    return { checked: open.length, replied: 0 };
  }

  return { checked: open.length, replied: answered.length };
}

/**
 * Chases open mail that has gone unanswered, alerting Telegram.
 *
 * Replaces the Make.com "Gap Watchdog". Re-alerts at most once per six hours
 * per thread via alert_outbox, so repeated runs do not spam the channel.
 */
export async function runWatchdog(olderThanHours = 12): Promise<{ unanswered: number; alerted: number }> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

  // Only chase mail that actually needs answering. Alerting on every open email
  // would page the channel about newsletters and one-time passcodes, which sit
  // open indefinitely — the original Make.com watchdog filtered to Reservation
  // for exactly this reason. Cancellation is included since it is time-critical.
  const { data: stale } = await supabaseAdmin
    .from("emails")
    .select("id, gmail_thread_id, sender_email, subject, greek_summary, urgency, received_at")
    .eq("status", "open")
    .in("category", ["Reservation", "Cancellation"])
    .lt("received_at", cutoff)
    .order("urgency", { ascending: false })
    .order("received_at", { ascending: true })
    .limit(10);

  if (!stale?.length) return { unanswered: 0, alerted: 0 };

  let alerted = 0;
  for (const email of stale) {
    const alertKey = `watchdog:thread:${email.gmail_thread_id}`;
    const { data: existing } = await supabaseAdmin
      .from("alert_outbox")
      .select("id, sent_at")
      .eq("key", alertKey)
      .maybeSingle();

    // Only re-alert if not alerted in the last 6 hours
    if (existing) {
      const sentAt = new Date(existing.sent_at ?? 0).getTime();
      if (Date.now() - sentAt < 6 * 60 * 60 * 1000) continue;
    }

    const age = Math.round((Date.now() - new Date(email.received_at).getTime()) / 3600000);
    const msg =
      `⏰ <b>Αναπάντητο Email (${age}h)</b>\n` +
      `Από: ${esc(email.sender_email)}\n` +
      `Θέμα: ${esc(email.subject ?? "(χωρίς θέμα)")}\n\n` +
      `${esc(email.greek_summary ?? "")}`;
    await sendTelegram(msg);
    await supabaseAdmin.from("alert_outbox").upsert(
      { key: alertKey, payload: msg, sent_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    alerted++;
  }

  return { unanswered: stale.length, alerted };
}

/**
 * Re-runs classification over stored emails that have no summary, which happens
 * when the model call failed or returned unparseable output.
 */
export async function reclassifyEmails(limit = 25): Promise<{ scanned: number; updated: number }> {
  const { data: rows } = await supabaseAdmin
    .from("emails")
    .select("id, subject, body_text, sender_email")
    .or("greek_summary.is.null,greek_summary.eq.")
    .order("received_at", { ascending: false })
    .limit(limit);

  let updated = 0;
  for (const row of rows ?? []) {
    const classification = await classifyEmail(row.subject, row.body_text, row.sender_email);
    if (!classification) continue;

    const { error } = await supabaseAdmin
      .from("emails")
      .update({
        category: classification.category,
        greek_summary: classification.greek_summary,
        urgency: classification.urgency,
        reservation_date: classification.reservation_date ?? null,
        suggested_action: classification.suggested_action,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (!error) updated++;
  }

  return { scanned: rows?.length ?? 0, updated };
}
