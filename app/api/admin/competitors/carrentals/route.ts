import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { planRuns, startRun, getRunStatus, ingestDataset, usdToEur, type PlannedRun } from "@/lib/carRentalsRates";

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
}

/**
 * Runs are started one at a time rather than all nine at once.
 *
 * A browser Actor needs a sizeable memory slot, and a constrained Apify plan
 * has few of them — launching nine together leaves the later ones to fail
 * outright rather than queue. Sequential costs about a minute per search and
 * survives any plan.
 */
async function readState(): Promise<Slot[] | null> {
  const { data } = await supabaseAdmin
    .from("system_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value); } catch { return null; }
}

async function writeState(slots: Slot[]) {
  await supabaseAdmin.from("system_settings").upsert({
    key: STATE_KEY,
    value: JSON.stringify(slots),
    updated_at: new Date().toISOString(),
  });
}

export async function POST() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

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

  await writeState(slots);
  return NextResponse.json({ ok: true, total: slots.length, started: 1 });
}

export async function GET() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const slots = await readState();
  if (!slots) return NextResponse.json({ status: "IDLE" });

  const rate = await usdToEur();

  const current = slots.find(s => s.runId && !s.done);

  if (current) {
    try {
      const { status, datasetId } = await getRunStatus(token, current.runId!);
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

  await writeState(slots);

  const finished = slots.filter(s => s.done).length;
  const errors = slots.filter(s => s.error).map(s => s.error!) as string[];

  return NextResponse.json({
    status: finished >= slots.length ? "DONE" : "RUNNING",
    total: slots.length,
    finished,
    stored: slots.reduce((n, s) => n + (s.stored ?? 0), 0),
    // Reported so the conversion applied to the stored figures is visible.
    usdToEur: rate,
    errors: errors.slice(0, 3),
  });
}
