import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";
import { syncEmails, detectReplies, runWatchdog } from "@/lib/emailSync";

export const maxDuration = 60;

// Runs daily at 08:00 Greece time (06:00 UTC in winter / 05:00 UTC in summer)
// Vercel cron configured in vercel.json
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The Vercel Hobby plan allows a single daily cron, so this route is the
  // orchestrator for every scheduled job. Each step is isolated: a failure in
  // one must not stop the others or block the briefing itself.
  let sync = null;
  try {
    sync = await syncEmails();
  } catch (err) {
    console.error("morning-briefing: email sync failed", err);
  }

  // Mark threads answered from Gmail before counting what is still open.
  let replies = null;
  try {
    replies = await detectReplies();
  } catch (err) {
    console.error("morning-briefing: reply detection failed", err);
  }

  let watchdog = null;
  try {
    watchdog = await runWatchdog();
  } catch (err) {
    console.error("morning-briefing: watchdog failed", err);
  }

  const today = new Date().toISOString().slice(0, 10);
  const briefingKey = `briefing:${today}`;

  // Idempotency — skip if already sent today
  const { data: existing } = await supabaseAdmin
    .from("alert_outbox")
    .select("id")
    .eq("key", briefingKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, sync, replies, watchdog });
  }

  // Today's pickups
  const { data: pickups } = await supabaseAdmin
    .from("reservations")
    .select("customer_name, vehicle_id, vehicles(name, plate), pickup_location, pickup_time")
    .eq("pickup_date", today)
    .in("status", ["confirmed", "active"])
    .order("pickup_time");

  // Today's returns
  const { data: returns } = await supabaseAdmin
    .from("reservations")
    .select("customer_name, vehicle_id, vehicles(name, plate), dropoff_location, return_time")
    .eq("return_date", today)
    .in("status", ["confirmed", "active"])
    .order("return_time");

  // Open unread emails
  const { count: openEmails } = await supabaseAdmin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  let msg = `☀️ <b>Καλημέρα! Briefing ${today}</b>\n\n`;

  if (pickups?.length) {
    msg += `🚗 <b>Παραλαβές σήμερα (${pickups.length}):</b>\n`;
    for (const p of pickups) {
      const v = (p.vehicles as { name?: string; plate?: string } | null);
      msg += `  • ${p.customer_name} — ${v?.name ?? "?"}${v?.plate ? ` (${v.plate})` : ""} @ ${p.pickup_time} | ${p.pickup_location ?? ""}\n`;
    }
    msg += "\n";
  } else {
    msg += "🚗 Δεν υπάρχουν παραλαβές σήμερα.\n\n";
  }

  if (returns?.length) {
    msg += `🔄 <b>Επιστροφές σήμερα (${returns.length}):</b>\n`;
    for (const r of returns) {
      const v = (r.vehicles as { name?: string; plate?: string } | null);
      msg += `  • ${r.customer_name} — ${v?.name ?? "?"}${v?.plate ? ` (${v.plate})` : ""} @ ${r.return_time} | ${r.dropoff_location ?? ""}\n`;
    }
    msg += "\n";
  } else {
    msg += "🔄 Δεν υπάρχουν επιστροφές σήμερα.\n\n";
  }

  if (openEmails && openEmails > 0) {
    msg += `📧 <b>Αναπάντητα emails: ${openEmails}</b>\n`;
  }

  await sendTelegram(msg);
  await supabaseAdmin.from("alert_outbox").insert({
    key: briefingKey,
    payload: msg,
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, sync, replies, watchdog });
}
