import { fetchNewEmails } from "@/lib/gmail";
import { classifyEmail } from "@/lib/emailClassifier";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export interface SyncResult {
  fetched: number;
  inserted: number;
  alerted: number;
}

/**
 * Pulls new mail from Gmail, classifies it with Claude, stores it, and raises a
 * Telegram alert for anything urgent.
 *
 * Shared by the scheduled cron, the daily briefing, and the manual "Sync now"
 * button so all three behave identically. Safe to call repeatedly: messages
 * already stored are skipped by gmail_message_id, and Telegram alerts are
 * de-duplicated through alert_outbox.
 */
export async function syncEmails(): Promise<SyncResult> {
  const emails = await fetchNewEmails();
  let inserted = 0;
  let alerted = 0;

  for (const email of emails) {
    // Skip if already stored
    const { data: existing } = await supabaseAdmin
      .from("emails")
      .select("id")
      .eq("gmail_message_id", email.gmailMessageId)
      .maybeSingle();

    if (existing) continue;

    // Classify with Claude
    const classification = await classifyEmail(email.subject, email.bodyText, email.senderEmail);

    // Attempt to link to a known customer
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id")
      .ilike("email", email.senderEmail)
      .maybeSingle();

    const { data: row } = await supabaseAdmin
      .from("emails")
      .insert({
        gmail_message_id: email.gmailMessageId,
        gmail_thread_id: email.gmailThreadId,
        sender_name: email.senderName,
        sender_email: email.senderEmail,
        subject: email.subject,
        body_text: email.bodyText?.slice(0, 10000),
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

    if (row) {
      inserted++;

      // Alert Telegram immediately for high-urgency emails
      if ((row.urgency ?? 2) >= 3) {
        const alertKey = `urgent:email:${row.id}`;
        const { data: outbox } = await supabaseAdmin
          .from("alert_outbox")
          .select("id")
          .eq("key", alertKey)
          .maybeSingle();

        if (!outbox) {
          const msg = `🚨 <b>Urgent Email</b>\nFrom: ${email.senderEmail}\nSubject: ${email.subject ?? "(no subject)"}\n\n${row.greek_summary ?? ""}\n\nAction: ${classification?.suggested_action ?? ""}`;
          await sendTelegram(msg);
          await supabaseAdmin.from("alert_outbox").insert({
            key: alertKey,
            payload: msg,
            sent_at: new Date().toISOString(),
          });
          alerted++;
        }
      }
    }
  }

  return { fetched: emails.length, inserted, alerted };
}
