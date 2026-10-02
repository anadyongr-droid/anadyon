import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { startFarosRun, getRunStatus, ingestFarosDataset } from "@/lib/farosRates";
import { recordImportCompleted } from "@/lib/rateImportLog";
import { decideRunRecovery, type StoredRun, type LiveRun } from "@/lib/apifyRunRecovery";

// Admin-only via proxy.ts.
export const maxDuration = 60;

const RUN_KEY = "faros_apify_run";

async function readStoredRun(): Promise<(StoredRun & { datasetId?: string }) | null> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", RUN_KEY)
    .maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}

async function writeStoredRun(run: Record<string, unknown>) {
  await supabaseAdmin.from("system_settings").upsert({
    key: RUN_KEY,
    value: JSON.stringify(run),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Faros collection runs in an Apify browser and takes over a minute, past the
 * serverless ceiling. So POST starts the run and returns, and GET reports on it
 * and ingests the results once it finishes.
 *
 * Which means a closed tab used to lose the run: it finished on Apify's servers
 * with nothing reading it, and pressing the button again started — and paid
 * for — another. POST now looks at the stored run first and collects a finished
 * one instead. `lib/apifyRunRecovery.ts` holds the rules and the reasoning.
 */
export async function POST() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN is not set in Vercel." }, { status: 400 });
  }

  const stored = await readStoredRun();
  let live: LiveRun | null = null;
  // Apify's own dataset id for the run, which is the one to read: the id stored
  // at start time is the one it announced then, and a resurrected run is
  // exactly the case where trusting the older copy is least safe.
  let liveDatasetId = "";
  if (stored?.runId && !stored.ingested) {
    // Swallowed rather than surfaced: an unreachable Apify makes this a start
    // with no previous run, which is what the code did before recovery existed.
    try {
      const status = await getRunStatus(token, stored.runId);
      live = { status: status.status, finishedAt: status.finishedAt };
      liveDatasetId = status.datasetId;
    } catch {
      live = null;
    }
  }

  const decision = decideRunRecovery(stored, live, new Date());

  if (decision.action === "wait") {
    return NextResponse.json({
      ok: true,
      runId: stored!.runId,
      status: "RUNNING",
      recovered: true,
      note: decision.reason,
    });
  }

  if (decision.action === "ingest") {
    try {
      const result = await ingestFarosDataset(token, liveDatasetId || stored!.datasetId || "");
      // Dated by when Apify finished the run, not by this press. A dataset
      // collected last night is last night's prices however long it sat unread.
      await recordImportCompleted("faros", decision.collectedAt ?? undefined);
      await writeStoredRun({ ...stored, ingested: true });
      return NextResponse.json({
        ok: true,
        runId: stored!.runId,
        status: "SUCCEEDED",
        recovered: true,
        note: decision.reason,
        ...result,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not collect the finished run" },
        { status: 500 }
      );
    }
  }

  try {
    const { runId, datasetId } = await startFarosRun(token);
    await writeStoredRun({
      runId,
      datasetId,
      startedAt: new Date().toISOString(),
      ingested: false,
    });
    // The reason is carried even on a plain start, so a press that threw away a
    // day-old finished run says so rather than looking like a fresh beginning.
    return NextResponse.json({ ok: true, runId, status: "RUNNING", note: decision.reason });
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
    const { status, datasetId, finishedAt } = await getRunStatus(token, run.runId);

    if (status !== "SUCCEEDED") {
      return NextResponse.json({ status, runId: run.runId });
    }

    // Ingest once, then remember so polling does not repeat the work.
    if (run.ingested) {
      return NextResponse.json({ status, runId: run.runId, alreadyIngested: true });
    }

    const result = await ingestFarosDataset(token, datasetId || run.datasetId);
    // The ingest is what makes the prices real, not the Apify run finishing —
    // but the prices are as old as the run, so that is the time recorded. On a
    // live poll the two are seconds apart; on a recovered one they are not.
    await recordImportCompleted("faros", finishedAt ? new Date(finishedAt) : undefined);
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
