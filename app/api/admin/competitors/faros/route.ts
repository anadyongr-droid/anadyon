import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { startFarosRun, getRunStatus, ingestFarosDataset } from "@/lib/farosRates";

// Admin-only via proxy.ts.
export const maxDuration = 60;

const RUN_KEY = "faros_apify_run";

/**
 * Faros collection runs in an Apify browser and takes over a minute, past the
 * serverless ceiling. So POST starts the run and returns, and GET reports on it
 * and ingests the results once it finishes.
 */
export async function POST() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });
  }

  try {
    const { runId, datasetId } = await startFarosRun(token);
    await supabaseAdmin.from("system_settings").upsert({
      key: RUN_KEY,
      value: JSON.stringify({ runId, datasetId, startedAt: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, runId, status: "RUNNING" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Apify run" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", RUN_KEY)
    .maybeSingle();

  if (!data?.value) return NextResponse.json({ status: "IDLE" });

  let run: { runId: string; datasetId: string; ingested?: boolean };
  try {
    run = JSON.parse(data.value);
  } catch {
    return NextResponse.json({ status: "IDLE" });
  }

  try {
    const { status, datasetId } = await getRunStatus(token, run.runId);

    if (status !== "SUCCEEDED") {
      return NextResponse.json({ status, runId: run.runId });
    }

    // Ingest once, then remember so polling does not repeat the work.
    if (run.ingested) {
      return NextResponse.json({ status, runId: run.runId, alreadyIngested: true });
    }

    const result = await ingestFarosDataset(token, datasetId || run.datasetId);
    await supabaseAdmin.from("system_settings").upsert({
      key: RUN_KEY,
      value: JSON.stringify({ ...run, ingested: true }),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ status, runId: run.runId, ...result });
  } catch (err) {
    return NextResponse.json(
      { status: "ERROR", error: err instanceof Error ? err.message : "Apify poll failed" },
      { status: 500 }
    );
  }
}
