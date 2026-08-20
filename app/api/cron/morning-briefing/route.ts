import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram, drainTelegramQueue } from "@/lib/telegram";
import { syncEmails, detectReplies, runWatchdog } from "@/lib/emailSync";
import { runHealthChecks, formatHealthAlert } from "@/lib/healthChecks";

export const maxDuration = 60;

/**
 * Runs one scheduled step against a time budget.
 *
 * The route has 60 seconds for everything and Vercel has already killed it
 * once. The steps were each wrapped in try/catch, which handles a step that
 * throws but not a step that simply takes too long — and email sync talking to
 * Gmail is exactly that shape. One slow step could consume the entire budget
 * and the staff briefing, the only part anyone is waiting for, would never be
 * sent.
 *
 * The timeout stops this route waiting; it cannot cancel work already in
 * flight on the other side of a network call. That is an acceptable trade: the
 * step is abandoned rather than aborted, and the briefing goes out.
 *
 * The Hobby plan permits a single cron, so genuinely splitting these into
 * independently retryable jobs is not available without either a paid plan or
 * a self-hosted scheduler. Budgeting is what fits the constraint.
 */
async function withBudget<T>(name: string, ms: number, work: () => Promise<T>): Promise<T | null> {
  const started = Date.now();
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`exceeded ${ms}ms`)), ms)
      ),
    ]);
  } catch (err) {
    const took = Date.now() - started;
    console.error(`morning-briefing: ${name} failed after ${took}ms:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Health checks go out as their own message, not appended to the briefing.
 *
 * The briefing is the staff's daily list of pickups and returns, in Greek.
 * These are technical faults for whoever maintains the site, and burying them
 * under today's returns is how they get skimmed past — which is the whole
 * failure being addressed: Google Analytics recorded nothing from launch and
 * the Resend webhook rejected every event for a day, both perfectly visible in
 * logs nobody was reading.
 *
 * Silent when everything passes. A daily "all fine" trains the reader to
 * ignore the channel.
 *
 * Called last, after the briefing has been sent, and never allowed to throw.
 * The staff's briefing is the job that matters; these checks make several
 * network calls and must not be able to delay or prevent it. This route shares
 * a 60-second budget with the email sync, and health information arriving a
 * moment later costs nothing.
 */
async function reportHealth() {
  try {
    const results = await runHealthChecks();
    const alert = formatHealthAlert(results);
    if (alert) await sendTelegram(alert);
    return results.map((r) => ({ name: r.name, ok: r.ok }));
  } catch (err) {
    console.error("morning-briefing: health checks failed", err);
    return null;
  }
}

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
  // Budgets, summing to 40s of the 60 available, so the briefing below always
  // has room. Email sync gets the largest share because it does the most
  // network work; the watchdog the least because it is a single query.
  const sync = await withBudget("email sync", 25_000, syncEmails);

  // Mark threads answered from Gmail before counting what is still open.
  const replies = await withBudget("reply detection", 10_000, detectReplies);

  const watchdog = await withBudget("watchdog", 5_000, runWatchdog);



  const today = new Date().toISOString().slice(0, 10);
  const briefingKey = `briefing:${today}`;

  // Idempotency — skip if already sent today
  const { data: existing } = await supabaseAdmin
    .from("alert_outbox")
    .select("id")
    .eq("key", briefingKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, sync, replies, watchdog, health: await reportHealth() });
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

  // Today's briefing is away; now retry anything that failed to send earlier.
  // Deliberately after, not before: a backlog must never delay the one message
  // staff are actually waiting for at 07:00.
  const requeued = await withBudget("telegram queue", 10_000, () => drainTelegramQueue());
  if (requeued && (requeued.sent || requeued.abandoned)) {
    console.info(
      `morning-briefing: telegram queue — ${requeued.sent} sent, ${requeued.failed} still failing, ${requeued.abandoned} abandoned`
    );
  }
  await supabaseAdmin.from("alert_outbox").insert({
    key: briefingKey,
    payload: msg,
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, sync, replies, watchdog, health: await reportHealth() });
}
