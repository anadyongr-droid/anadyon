import { supabaseAdmin } from "@/lib/supabase";
import { durationBand } from "@/lib/competitorRates";

/**
 * Competitor rates from CarRentals.com, via the Apify community actor.
 *
 * This is a different competitive set from the local operators: every supplier
 * returned for Zakynthos is an international brand (Budget, Avis, Enterprise,
 * Alamo, Hertz, Sixt), so it shows what a tourist booking from abroad pays at
 * the airport rather than what Ionian or Faros charge at the desk. Treat it as
 * the branded ceiling, not a like-for-like local comparison.
 *
 * The site is a US point of sale and quotes USD regardless of a currency
 * parameter, so amounts are converted at ingest using the day's rate.
 */

const ACTOR = "shahidirfan~carrentals-com-scraper";
const COMPETITOR = { slug: "carrentals", label: "CarRentals.com (majors)" };
const LOCATION = "Zakynthos Airport (ZTH)";

export const CARRENTALS_DURATIONS = [2, 5, 10] as const;

export function carRentalsPickupDates(): string[] {
  return ["2026-08-25", "2026-09-15", "2026-10-15"];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** CarRentals.com expects MM/DD/YYYY. */
function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function buildSearchUrl(checkIn: string, days: number): string {
  const params = new URLSearchParams({
    locn: LOCATION,
    date1: usDate(checkIn),
    date2: usDate(addDays(checkIn, days)),
    time1: "1030AM",
    time2: "1030AM",
  });
  return `https://www.carrentals.com/carsearch?${params.toString()}`;
}

export interface PlannedRun { checkIn: string; days: number; url: string }

export function planRuns(): PlannedRun[] {
  return carRentalsPickupDates().flatMap(d =>
    CARRENTALS_DURATIONS.map(days => ({ checkIn: d, days, url: buildSearchUrl(d, days) }))
  );
}

export async function usdToEur(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    const rate = json?.rates?.EUR;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    // fall through
  }
  // Conservative fallback so a rate-service outage does not abort collection.
  return 0.86;
}

export async function startRun(token: string, run: PlannedRun): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrl: run.url,
      results_wanted: 60,
      max_pages: 3,
      // The site defends heavily; residential proxies are what the actor recommends.
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    }),
  });
  if (!res.ok) throw new Error(`Apify start failed (${res.status}): ${(await res.text()).slice(0, 180)}`);
  const json = await res.json();
  return { runId: json.data.id, datasetId: json.data.defaultDatasetId };
}

export async function getRunStatus(token: string, runId: string): Promise<{ status: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Apify status failed (${res.status})`);
  const json = await res.json();
  return { status: json.data.status, datasetId: json.data.defaultDatasetId };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function pick(item: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(item)) {
    if (keys.some(want => k.toLowerCase() === want)) return item[k];
  }
  for (const k of Object.keys(item)) {
    if (keys.some(want => k.toLowerCase().includes(want))) return item[k];
  }
  return undefined;
}

/**
 * Maps the actor's dataset into competitor_rates.
 *
 * Field names are matched loosely because this is a community actor whose
 * output shape is not contractual; if nothing maps, the first record is
 * reported back so the mapping can be corrected rather than failing silently.
 */
export async function ingestDataset(
  token: string,
  datasetId: string,
  run: PlannedRun,
  rate: number
): Promise<number> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`);
  if (!res.ok) throw new Error(`Dataset fetch failed (${res.status})`);
  const items: Record<string, unknown>[] = await res.json();
  if (!Array.isArray(items) || !items.length) return 0;

  const rows = items.map(it => {
    const supplier = String(pick(it, ["supplier", "vendor", "company", "agency", "brand"]) ?? "").trim();
    const model = String(pick(it, ["car", "vehicle", "model", "name", "title"]) ?? "").trim();
    const category = String(pick(it, ["category", "cartype", "class", "type"]) ?? "").trim();
    const perDayUsd = num(pick(it, ["priceperday", "perday", "dailyrate", "daily"]));
    const totalUsd = num(pick(it, ["totalprice", "total"]));

    const perDay = perDayUsd ?? (totalUsd !== null ? totalUsd / run.days : null);
    const label = [supplier, model].filter(Boolean).join(" — ") || model || supplier;

    return {
      competitor: COMPETITOR.slug,
      competitor_label: COMPETITOR.label,
      source: "carrentals",
      pickup_date: run.checkIn,
      return_date: addDays(run.checkIn, run.days),
      duration_days: run.days,
      duration_band: durationBand(run.days),
      pickup_location: LOCATION,
      vehicle_name: label.slice(0, 160),
      manufacturer: supplier || null,
      car_group: category || null,
      transmission: String(pick(it, ["transmission"]) ?? "") || null,
      category: "Car",
      // Stored in EUR so it sits alongside every other competitor.
      price_per_day: perDay === null ? null : Math.round(perDay * rate * 100) / 100,
      total_price: totalUsd === null ? null : Math.round(totalUsd * rate * 100) / 100,
      original_price: null,
      currency: "EUR",
      scraped_at: new Date().toISOString(),
    };
  }).filter(r => r.vehicle_name && r.price_per_day !== null);

  if (!rows.length) {
    throw new Error(
      `No usable rows. First record had keys: ${Object.keys(items[0]).slice(0, 12).join(", ")}`
    );
  }

  const { error } = await supabaseAdmin
    .from("competitor_rates")
    .upsert(rows, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });
  if (error) throw new Error(`Storing CarRentals rates failed: ${error.message}`);

  return rows.length;
}
