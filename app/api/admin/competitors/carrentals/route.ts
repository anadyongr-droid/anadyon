import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { planRuns, startRun, getRunStatus, ingestDataset, usdToEur, type PlannedRun } from "@/lib/carRentalsRates";
import { recordImportCompleted } from "@/lib/rateImportLog";
import { decidePlanRecovery, oldestCollection } from "@/lib/apifyRunRecovery";

// Admin-only via proxy.ts.
export const maxDuration = 60;

const STATE_KEY = "carrentals_apify_runs";

interface Slot {
  checkIn: string;
  days: number;
  url: string;
  runId?: string;
  datasetId?: string;
  done?: boolean;
  stored?: number;
  error?: string;
  /** Apify's finish time for this search, which is when its prices were seen. */
  collectedAt?: string;
}

/**
 * The stored pass: the nine searches and when they were planned.
 *
 * `plannedAt` was added with abandoned-run recovery. State written before it
 * existed reads as undefined and is treated as too old to resume, which is the
 * safe direction — resuming a plan of unknown age could ingest searches for
 * pickup dates that have already passed.
 */
interface PassState {
  plannedAt?: string;
  slots: Slot[];
}

/**
 * Runs are started one at a time rather than all nine at once.
 *
 * A browser Actor needs a sizeable memory slot, and a constrained Apify plan
 * has few of them — launching nine together leaves the later ones to fail
 * outright rather than queue. Sequential costs about a minute per search and
 * survives any plan.
 */
async function readState(): Promise<PassState | null> {
  const { data } = await supabaseAdmin
    .from("system_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = JSON.parse(data.value);
    // State used to be a bare array of slots. A stored pass from before the
    // recovery change still parses, and lands with no `plannedAt` — which the
    // decision treats as stale rather than guessing its age.
    return Array.isArray(parsed) ? { slots: parsed } : parsed;
  } catch { return null; }
}

async function writeState(state: PassState) {
  await supabaseAdmin.from("system_settings").upsert({
    key: STATE_KEY,
    value: JSON.stringify(state),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Starts a pass — or picks up the one that was abandoned.
 *
 * Ingestion happens in the polling `GET`, so closing the tab used to strand the
 * pass: the searches already paid for sat finished and unread, and pressing the
 * button again replanned from scratch and paid for them a second time. Through
 * residential proxies billed by traffic, that is the expensive kind of restart.
 * `lib/apifyRunRecovery.ts` holds the rules and the reasoning.
 */
export async function POST() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const existing = await readState();
  const decision = decidePlanRecovery(existing?.plannedAt, existing?.slots ?? null, new Date());

  if (decision.action === "resume") {
    // Nothing is started here. The unfinished plan stays exactly as it is and
    // the poll that follows drives it on, which is the same path it would have
    // taken had the tab never been closed.
    return NextResponse.json({
      ok: true,
      resumed: true,
      total: decision.total,
      finished: decision.finished,
      note: decision.reason,
    });
  }

  const slots: Slot[] = planRuns().map((r: PlannedRun) => ({ checkIn: r.checkIn, days: r.days, url: r.url }));

  try {
    const { runId, datasetId } = await startRun(token, slots[0]);
    slots[0].runId = runId;
    slots[0].datasetId = datasetId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the first run" },
      { status: 500 }
    );
  }

  await writeState({ plannedAt: new Date().toISOString(), slots });
  // `discarded` says how much of a previous pass was thrown away. A bare
  // "started" would hide eight finished searches being abandoned.
  return NextResponse.json({
    ok: true,
    total: slots.length,
    started: 1,
    note: decision.reason,
    discarded: decision.finished,
  });
}

export async function GET() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const state = await readState();
  if (!state?.slots?.length) return NextResponse.json({ status: "IDLE" });
  const slots = state.slots;

  const rate = await usdToEur();

  const current = slots.find(s => s.runId && !s.done);

  if (current) {
    try {
      const { status, datasetId, finishedAt } = await getRunStatus(token, current.runId!);
      if (status === "RUNNING" || status === "READY") {
        return NextResponse.json({
          status: "RUNNING",
          total: slots.length,
          finished: slots.filter(s => s.done).length,
          stored: slots.reduce((n, s) => n + (s.stored ?? 0), 0),
          current: `${current.checkIn} ${current.days}d`,
        });
      }

      if (status === "SUCCEEDED") {
        current.stored = await ingestDataset(token, datasetId || current.datasetId!, current, rate);
        current.collectedAt = finishedAt ?? new Date().toISOString();
      } else {
        current.error = `${current.checkIn} ${current.days}d: run ${status}`;
      }
    } catch (err) {
      current.error = `${current.checkIn} ${current.days}d: ${err instanceof Error ? err.message : "failed"}`;
    }
    current.done = true;
  }

  // Start the next queued search, if any.
  const next = slots.find(s => !s.runId);
  if (next) {
    try {
      const { runId, datasetId } = await startRun(token, next);
      next.runId = runId;
      next.datasetId = datasetId;
    } catch (err) {
      next.error = `${next.checkIn} ${next.days}d: ${err instanceof Error ? err.message : "start failed"}`;
      next.done = true;
    }
  }

  await writeState({ ...state, slots });

  const finished = slots.filter(s => s.done).length;
  const errors = slots.filter(s => s.error).map(s => s.error!) as string[];
  const done = finished >= slots.length;

  // Recorded once, when the last of the nine searches is in - not after each
  // one. `lib/rateImportLog.ts` says why: a partial batch has refreshed some
  // searches and not others, and dating the import from it overstates how
  // current the prices are, which is the exact fault the log replaced.
  //
  // Dated by the oldest search rather than the newest, because a resumed pass
  // can mix this morning's with yesterday evening's and the comparison shows
  // them in one grid.
  if (done) {
    await recordImportCompleted("carrentals", oldestCollection(slots) ?? undefined);
  }

  return NextResponse.json({
    status: done ? "DONE" : "RUNNING",
    total: slots.length,
    finished,
    stored: slots.reduce((n, s) => n + (s.stored ?? 0), 0),
    // Reported so the conversion applied to the stored figures is visible.
    usdToEur: rate,
    errors: errors.slice(0, 3),
  });
}
