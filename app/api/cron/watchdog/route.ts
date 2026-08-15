import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

// Every 2 hours — alerts on open emails older than 4 hours with no reply
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await supabaseAdmin
    .from("emails")
    .select("id, gmail_thread_id, sender_email, subject, greek_summary, urgency, received_at")
    .eq("status", "open")
    .lt("received_at", fourHoursAgo)
    .order("urgency", { ascending: false })
    .order("received_at", { ascending: true })
    .limit(10);

  if (!stale?.length) {
    return NextResponse.json({ ok: true, unanswered: 0 });
  }

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
    const msg = `⏰ <b>Unanswered Email (${age}h)</b>\nFrom: ${email.sender_email}\nSubject: ${email.subject ?? "(no subject)"}\n\n${email.greek_summary ?? ""}`;
    await sendTelegram(msg);
    await supabaseAdmin.from("alert_outbox").upsert({
      key: alertKey,
      payload: msg,
      sent_at: new Date().toISOString(),
    }, { onConflict: "key" });
  }

  return NextResponse.json({ ok: true, unanswered: stale.length });
}
