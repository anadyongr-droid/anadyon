import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram, drainTelegramQueue } from "@/lib/telegram";
import { blockChase, ESCALATE_FROM_DAYS } from "@/lib/vehicleBlocks";
import { sendMail } from "@/lib/mailer";
import { drainMailQueue } from "@/lib/mailer";
import { syncEmails, detectReplies, runWatchdog } from "@/lib/emailSync";
import { runHealthChecks, formatHealthAlert } from "@/lib/healthChecks";
import { summariseOpenDamage, type DamageSeverity, type OpenDamageRow } from "@/lib/openDamage";

/** The briefing is Greek; the column is an English check constraint. */
const SEVERITY_EL: Record<DamageSeverity, string> = {
  minor: "ελαφριά",
  moderate: "μέτρια",
  major: "σοβαρή",
};

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
/**
 * Same shape as the copies in the quote and reservation routes. Local rather
 * than shared because that is this codebase's existing convention for it;
 * worth centralising one day, but not as a side effect of a fleet feature.
 */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  // 20s inside a 25s race, deliberately. The loop stops itself with time left
  // to save its cursor; the race is only a backstop for a call that hangs
  // somewhere the deadline cannot reach. When the race won instead, the cursor
  // write was discarded and the sync stalled for two days.
  const sync = await withBudget("email sync", 25_000, () => syncEmails({ budgetMs: 20_000 }));

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

  // Vehicles out of the active fleet. Blueprint §7.4: nothing releases these
  // but a person, so the only thing standing between a car in a workshop and a
  // car nobody has thought about for a fortnight is this reminder.
  const { data: openBlocks } = await supabaseAdmin
    .from("vehicle_blocks")
    .select("id, reason, starts_on, expected_return, note, vehicles(name, plate)")
    .is("released_at", null)
    .order("starts_on");

  const chased = (openBlocks ?? [])
    .map((b) => ({ block: b, chase: blockChase(b) }))
    .filter((x) => x.chase.urgency !== "quiet");
  const escalated = chased.filter((x) => x.chase.urgency === "escalate");

  /** "out 4 days, expected back in 6" — the second half is what stops it being a nag. */
  const outLine = (x: (typeof chased)[number]) => {
    const v = x.block.vehicles as { name?: string; plate?: string | null } | null;
    const days = x.chase.daysOut === 1 ? "1 ημέρα" : `${x.chase.daysOut} ημέρες`;
    const expected =
      x.chase.daysToExpected === null ? " — χωρίς εκτιμώμενη επιστροφή"
      : x.chase.daysToExpected >= 0 ? ` — αναμένεται σε ${x.chase.daysToExpected}`
      : ` — ΕΚΠΡΟΘΕΣΜΟ κατά ${Math.abs(x.chase.daysToExpected)}`;
    return `  • ${v?.name ?? "?"}${v?.plate ? ` (${v.plate})` : ""} — εκτός ${days}${expected}${x.block.note ? ` | ${x.block.note}` : ""}`;
  };

  // Unrepaired damage across the fleet. Blueprint: recorded since migration 011
  // and surfaced nowhere but one vehicle's modal, so a scuff reported in June
  // could sit unrepaired all season without anyone being reminded of it.
  //
  // No repair costs are read — see lib/openDamage.ts. This is a nudge, not a
  // financial report, and the briefing goes to a Telegram group.
  const { data: openDamageRows } = await supabaseAdmin
    .from("vehicle_damages")
    .select("vehicle_id, severity, reported_on, description, vehicles(name, plate)")
    .is("repaired_on", null);

  const damaged = summariseOpenDamage((openDamageRows ?? []) as unknown as OpenDamageRow[]);
  /** vehicle_id → "Micra (ΖΑΚ-1234)", so the summary can name the car. */
  const damagedNames = new Map<string, string>();
  for (const r of (openDamageRows ?? []) as Array<{ vehicle_id: string; vehicles?: { name?: string; plate?: string | null } | null }>) {
    if (damagedNames.has(r.vehicle_id)) continue;
    const v = r.vehicles;
    damagedNames.set(r.vehicle_id, `${v?.name ?? "?"}${v?.plate ? ` (${v.plate})` : ""}`);
  }

  // Open unread emails
  const { count: openEmails } = await supabaseAdmin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  let msg = `☀️ <b>Καλημέρα! Briefing ${today}</b>\n\n`;

  // Above the day's movements on purpose. A vehicle that has been out four days
  // is not news that keeps until the end of the message.
  if (escalated.length) {
    msg += `🔧 <b>ΟΧΗΜΑΤΑ ΕΚΤΟΣ ΣΤΟΛΟΥ — ΑΠΑΙΤΕΙΤΑΙ ΕΝΕΡΓΕΙΑ (${escalated.length}):</b>\n`;
    escalated.forEach((x) => { msg += `${outLine(x)}\n`; });
    msg += "\n";
  }

  // Below the escalated blocks and above the day's movements. A car out of the
  // fleet for four days needs action today; damage needs to be remembered, and
  // the difference in urgency is the order they appear in.
  if (damaged.length) {
    msg += `🔧 <b>Ζημιές σε εκκρεμότητα (${damaged.length}):</b>\n`;
    for (const d of damaged) {
      const days = d.daysOpen === 1 ? "1 ημέρα" : `${d.daysOpen} ημέρες`;
      msg += `  • ${damagedNames.get(d.vehicle_id) ?? "?"} — ${d.total > 1 ? `${d.total} ζημιές, χειρότερη ` : ""}${SEVERITY_EL[d.worst]} — ανοιχτή ${days}\n`;
    }
    msg += "\n";
  }

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

  // The day-2 reminders, below the movements: visibility rather than alarm.
  // Anything already escalated is at the top and is not repeated here.
  const reminders = chased.filter((x) => x.chase.urgency === "remind");
  if (reminders.length) {
    msg += `🔧 <b>Εκτός στόλου (${reminders.length}):</b>\n`;
    reminders.forEach((x) => { msg += `${outLine(x)}\n`; });
    msg += "\n";
  }

  if (openEmails && openEmails > 0) {
    msg += `📧 <b>Αναπάντητα emails: ${openEmails}</b>\n`;
  }

  await sendTelegram(msg);

  /**
   * Escalation only — never the daily reminder.
   *
   * §7.4: the briefing is read every morning and carries the routine
   * visibility. An email arriving every day about the same vehicle gets
   * filtered, and a filtered alert is worse than none — so email is reserved
   * for the four-days-out case, and its arrival is itself the signal.
   *
   * To the owner directly rather than customerservice@: an asset sitting idle
   * is not a customer-service matter, and the shared inbox forwards there
   * anyway, which would deliver it twice.
   */
  if (escalated.length) {
    const rows = escalated.map((x) => {
      const v = x.block.vehicles as { name?: string; plate?: string | null } | null;
      const expected = x.chase.daysToExpected === null
        ? "none recorded"
        : x.chase.daysToExpected >= 0
          ? `in ${x.chase.daysToExpected} day${x.chase.daysToExpected === 1 ? "" : "s"}`
          : `overdue by ${Math.abs(x.chase.daysToExpected)} day${Math.abs(x.chase.daysToExpected) === 1 ? "" : "s"}`;
      return `<tr><td>${esc(v?.name ?? "?")}${v?.plate ? ` (${esc(v.plate)})` : ""}</td>`
        + `<td>${esc(x.block.reason)}</td><td>${esc(x.block.starts_on)}</td>`
        + `<td>${x.chase.daysOut}</td><td>${esc(expected)}</td>`
        + `<td>${esc(x.block.note ?? "")}</td></tr>`;
    }).join("");

    await sendMail({
      from: "Anadyon Alerts <no-reply@anadyon.gr>",
      to: ["anadyon.gr@gmail.com"],
      // No replyTo: this is an alert, and Reply belongs inside the office.
      subject: `🔧 ${escalated.length} vehicle${escalated.length === 1 ? "" : "s"} out of the fleet for ${ESCALATE_FROM_DAYS}+ days`,
      html: `
        <p>These vehicles are recorded as out of the active fleet and nobody has
        put them back. They cannot be booked — online or by staff — until
        somebody records them returned.</p>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><th align="left">Vehicle</th><th align="left">Reason</th><th align="left">Out since</th>
              <th align="left">Days</th><th align="left">Expected</th><th align="left">Note</th></tr>
          ${rows}
        </table>
        <hr/>
        <p style="color:#888;font-size:12px;">An expected return date never releases a vehicle by itself —
        that is deliberate. Record it back from the Today screen or the vehicle's Blocks tab.
        Replies to this email reach the office, not a customer.</p>
      `,
    });
  }

  // Today's briefing is away; now retry anything that failed to send earlier.
  // Deliberately after, not before: a backlog must never delay the one message
  // staff are actually waiting for at 07:00.
  const requeued = await withBudget("telegram queue", 10_000, () => drainTelegramQueue());
  const remailed = await withBudget("mail queue", 15_000, () => drainMailQueue());
  if (remailed && (remailed.sent || remailed.abandoned)) {
    console.info(
      `morning-briefing: mail queue — ${remailed.sent} sent, ${remailed.failed} still failing, ${remailed.abandoned} abandoned`
    );
  }
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
