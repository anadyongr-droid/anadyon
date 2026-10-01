import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildTaskMatrix,
  taskMatrixShape,
  runScrapeTask,
  CRAWL_DELAY_MS,
  type TaskResult,
} from "@/lib/competitorRates";
import { collectPodilatadiko, type PodilatadikoResult } from "@/lib/podilatadikoRates";
import { collectRentScooterZante, type RentScooterZanteResult } from "@/lib/rentScooterZanteRates";
import { recordImportCompleted } from "@/lib/rateImportLog";

// Admin-only: proxy.ts admits only admins to /api/admin/competitors/*.
export const maxDuration = 60;

/**
 * ezcar.eu asks for 10 seconds between requests. With a 60s function ceiling
 * that allows four searches per invocation, so the matrix is walked across
 * several calls with a cursor rather than in one long run.
 */
const TASKS_PER_RUN = 4;
const CURSOR_KEY = "competitor_scrape_cursor";

/** Target months: August, September and October 2026. */
function pickupDates(): Date[] {
  // Mid-month where possible; August is sampled later since the earlier part of
  // the month has already passed and EzCar will not quote past dates.
  return [
    new Date(2026, 7, 25), // 25 Aug 2026
    new Date(2026, 8, 15), // 15 Sep 2026
    new Date(2026, 9, 15), // 15 Oct 2026
  ];
}

/**
 * The saved position in the task matrix, and the matrix it was taken against.
 *
 * The shape is stored with it because the cursor is an index and means nothing
 * on its own: interleaving the bike searches, adding a tenant or changing the
 * sampled durations all move what a given index refers to. Resuming into the
 * wrong search would skip some and repeat others while the progress count went
 * on looking complete.
 */
async function readCursor(): Promise<{ cursor: number; shape: string | null }> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();

  const raw = data?.value ?? "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const n = Number(parsed.cursor);
      return {
        cursor: Number.isFinite(n) && n >= 0 ? n : 0,
        shape: typeof parsed.shape === "string" ? parsed.shape : null,
      };
    }
  } catch {
    // Falls through to the bare-integer form below.
  }

  // The value was a bare integer before the shape was recorded. Read as a
  // position with an unknown shape, which restarts the pass once — the safe
  // direction, since that cursor was taken against the old bikes-last order.
  const n = parseInt(raw || "0", 10);
  return { cursor: Number.isFinite(n) && n >= 0 ? n : 0, shape: null };
}

async function writeCursor(cursor: number, shape: string): Promise<void> {
  await supabaseAdmin.from("system_settings").upsert({
    key: CURSOR_KEY,
    value: JSON.stringify({ cursor, shape }),
    updated_at: new Date().toISOString(),
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  const restart = new URL(req.url).searchParams.get("restart") === "1";

  const tasks = buildTaskMatrix(pickupDates());
  const shape = taskMatrixShape(tasks);

  const saved = restart ? { cursor: 0, shape } : await readCursor();
  // A cursor taken against a different matrix points at a different search, so
  // it is discarded rather than trusted. Restarting costs one repeated pass;
  // resuming into the wrong index skips searches silently.
  const resumable = saved.shape === shape;
  let cursor = resumable ? saved.cursor : 0;
  const restarted = !restart && !resumable && saved.cursor > 0;

  if (cursor >= tasks.length) {
    return NextResponse.json({
      ok: true,
      done: true,
      total: tasks.length,
      completed: tasks.length,
      message: "All searches already collected. Pass ?restart=1 to refresh.",
    });
  }

  const results: TaskResult[] = [];

  for (let i = 0; i < TASKS_PER_RUN && cursor < tasks.length; i++, cursor++) {
    // Honour Crawl-Delay between requests, but never waste it before the first
    // one or after the last.
    if (i > 0) await sleep(CRAWL_DELAY_MS);
    results.push(await runScrapeTask(tasks[cursor]));
  }

  await writeCursor(cursor, shape);

  const done = cursor >= tasks.length;
  const errors = results.filter(r => r.error).map(r => `${r.competitor} ${r.pickup} ${r.days}d: ${r.error}`);
  let bicycles: PodilatadikoResult | null = null;
  let scooters: RentScooterZanteResult | null = null;

  // Podilatadiko rides along on the final call rather than getting its own
  // button. It is a published tariff on three static pages, not a date search,
  // so it costs three fetches and needs no cursor — running it every batch
  // would just re-fetch the same prices a dozen times over.
  if (done) {
    try {
      bicycles = await collectPodilatadiko();
      errors.push(...bicycles.errors);
      await recordImportCompleted("podilatadiko");
    } catch (err) {
      errors.push(`Podilatadiko: ${err instanceof Error ? err.message : "collection failed"}`);
    }
    // Rent Scooter Car Zante rides along for the same reason Podilatadiko does:
    // a published tariff on one static page, not a date search, so it costs a
    // single fetch and needs no cursor of its own. It is the only motorbike
    // source besides Ionian Rentals - see blueprint §1.6a.
    try {
      scooters = await collectRentScooterZante();
      errors.push(...scooters.errors);
      // Recorded only when rows were actually stored. A pass that parsed
      // nothing has not refreshed the prices, and dating the import from it
      // would overstate how current they are.
      if (scooters.stored > 0) await recordImportCompleted("rentscooterzante");
    } catch (err) {
      errors.push(`Rent Scooter Car Zante: ${err instanceof Error ? err.message : "collection failed"}`);
    }
    // Recorded only here, on the call that completes the matrix. A partial
    // batch has refreshed some searches and not others, and dating the import
    // from it would overstate how current the prices are - which is the defect
    // this log replaces.
    await recordImportCompleted("ezcar");
  }

  return NextResponse.json({
    ok: true,
    done,
    total: tasks.length,
    completed: cursor,
    remaining: Math.max(0, tasks.length - cursor),
    // Said out loud: a pass that silently restarted would otherwise look like
    // one that had simply made no progress since the last call.
    restarted,
    stored: results.reduce((sum, r) => sum + r.stored, 0) + (bicycles?.stored ?? 0),
    bicycles: bicycles ? { models: bicycles.models, stored: bicycles.stored, segments: bicycles.segments } : null,
    scooters: scooters ? { models: scooters.models, stored: scooters.stored, months: scooters.months } : null,
    errors,
    results,
  });
}

/** Progress without performing any requests. */
export async function GET() {
  const tasks = buildTaskMatrix(pickupDates());
  const shape = taskMatrixShape(tasks);
  const saved = await readCursor();
  // Progress against a matrix this cursor was not taken from is not progress.
  const cursor = saved.shape === shape ? saved.cursor : 0;

  const { count } = await supabaseAdmin
    .from("competitor_rates")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    total: tasks.length,
    completed: Math.min(cursor, tasks.length),
    remaining: Math.max(0, tasks.length - cursor),
    done: cursor >= tasks.length,
    rowsStored: count ?? 0,
  });
}
