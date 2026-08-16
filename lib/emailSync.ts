import { fetchNewEmails, advanceSyncCursor } from "@/lib/gmail";
import { classifyEmail } from "@/lib/emailClassifier";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export interface SyncResult {
  fetched: number;
  inserted: number;
  alerted: number;
  /** Messages left for the next run when a backlog exceeds one batch. */
  remaining: number;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
export async function syncEmails(): Promise<SyncResult> {
  const { emails, remaining } = await fetchNewEmails();
  let inserted = 0;
  let alerted = 0;
  let cursor: Date | null = null;

  for (const email of emails) {
    try {
      // Skip if already stored
      const { data: existing } = await supabaseAdmin
        .from("emails")
        .select("id")
        .eq("gmail_message_id", email.gmailMessageId)
        .maybeSingle();

      if (existing) {
        cursor = email.receivedAt;
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
      cursor = email.receivedAt;

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

  if (cursor) await advanceSyncCursor(cursor);

  return { fetched: emails.length, inserted, alerted, remaining };
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
