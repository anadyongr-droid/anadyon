import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { planRuns, startRun, getRunStatus, ingestDataset, usdToEur } from "@/lib/carRentalsRates";

// Admin-only via proxy.ts.
export const maxDuration = 60;

const STATE_KEY = "carrentals_apify_runs";

interface RunState {
  runId: string;
  datasetId: string;
  checkIn: string;
  days: number;
  url: string;
  ingested?: boolean;
  stored?: number;
  error?: string;
}

/**
 * The actor takes one search URL per run, so a full sweep is nine runs. They
 * are started together and Apify queues whatever exceeds the account's
 * concurrency; GET then polls and ingests each as it finishes.
 */
export async function POST() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const planned = planRuns();
  const states: RunState[] = [];
  const failures: string[] = [];

  for (const run of planned) {
    try {
      const { runId, datasetId } = await startRun(token, run);
      states.push({ runId, datasetId, checkIn: run.checkIn, days: run.days, url: run.url });
    } catch (err) {
      failures.push(`${run.checkIn} ${run.days}d: ${err instanceof Error ? err.message : "start failed"}`);
    }
  }

  if (!states.length) {
    return NextResponse.json({ error: failures[0] ?? "Could not start any run." }, { status: 500 });
  }

  await supabaseAdmin.from("system_settings").upsert({
    key: STATE_KEY,
    value: JSON.stringify(states),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, started: states.length, total: planned.length, failures });
}

export async function GET() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", STATE_KEY)
    .maybeSingle();

  if (!data?.value) return NextResponse.json({ status: "IDLE" });

  let states: RunState[];
  try {
    states = JSON.parse(data.value);
  } catch {
    return NextResponse.json({ status: "IDLE" });
  }

  const rate = await usdToEur();
  let finished = 0;
  let stored = 0;
  let running = 0;
  const errors: string[] = [];

  for (const s of states) {
    if (s.ingested) { finished++; stored += s.stored ?? 0; continue; }
    if (s.error) { finished++; errors.push(s.error); continue; }

    try {
      const { status, datasetId } = await getRunStatus(token, s.runId);
      if (status === "RUNNING" || status === "READY") { running++; continue; }

      if (status === "SUCCEEDED") {
        const n = await ingestDataset(token, datasetId || s.datasetId, s, rate);
        s.ingested = true;
        s.stored = n;
        stored += n;
      } else {
        s.error = `${s.checkIn} ${s.days}d: run ${status}`;
        errors.push(s.error);
      }
      finished++;
    } catch (err) {
      s.error = `${s.checkIn} ${s.days}d: ${err instanceof Error ? err.message : "ingest failed"}`;
      errors.push(s.error);
      finished++;
    }
  }

  await supabaseAdmin.from("system_settings").upsert({
    key: STATE_KEY,
    value: JSON.stringify(states),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    status: running > 0 ? "RUNNING" : "DONE",
    total: states.length,
    finished,
    running,
    stored,
    usdToEur: rate,
    errors: errors.slice(0, 3),
  });
}
