import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildTaskMatrix,
  runScrapeTask,
  CRAWL_DELAY_MS,
  type TaskResult,
} from "@/lib/competitorRates";
import { collectPodilatadiko, type PodilatadikoResult } from "@/lib/podilatadikoRates";

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

async function readCursor(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  const n = parseInt(data?.value ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function writeCursor(value: number): Promise<void> {
  await supabaseAdmin.from("system_settings").upsert({
    key: CURSOR_KEY,
    value: String(value),
    updated_at: new Date().toISOString(),
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  const restart = new URL(req.url).searchParams.get("restart") === "1";

  const tasks = buildTaskMatrix(pickupDates());
  let cursor = restart ? 0 : await readCursor();

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

  await writeCursor(cursor);

  const done = cursor >= tasks.length;
  const errors = results.filter(r => r.error).map(r => `${r.competitor} ${r.pickup} ${r.days}d: ${r.error}`);
  let bicycles: PodilatadikoResult | null = null;

  // Podilatadiko rides along on the final call rather than getting its own
  // button. It is a published tariff on three static pages, not a date search,
  // so it costs three fetches and needs no cursor — running it every batch
  // would just re-fetch the same prices a dozen times over.
  if (done) {
    try {
      bicycles = await collectPodilatadiko();
      errors.push(...bicycles.errors);
    } catch (err) {
      errors.push(`Podilatadiko: ${err instanceof Error ? err.message : "collection failed"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    done,
    total: tasks.length,
    completed: cursor,
    remaining: Math.max(0, tasks.length - cursor),
    stored: results.reduce((sum, r) => sum + r.stored, 0) + (bicycles?.stored ?? 0),
    bicycles: bicycles ? { models: bicycles.models, stored: bicycles.stored, segments: bicycles.segments } : null,
    errors,
    results,
  });
}

/** Progress without performing any requests. */
export async function GET() {
  const tasks = buildTaskMatrix(pickupDates());
  const cursor = await readCursor();

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
