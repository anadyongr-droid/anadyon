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
    // The Actor parses the URL literally and requires both pickup and drop-off:
    // "Expected locn and dpln parameters in the URL." The site's own JS defaults
    // the drop-off when it is absent, which is why the page worked without it.
    dpln: LOCATION,
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

/**
 * Residential proxies route through consumer ISP connections rather than a data
 * centre. carrentals.com rate-limits Apify's shared datacenter pool with 429s
 * regardless of browser fingerprint, so they are the only way this Actor
 * returns data at all. They bill by traffic volume, which is why they were
 * once a per-run choice — but a run without them collects nothing, so the
 * choice only ever produced failed runs and is no longer offered.
 *
 * The country is pinned so results stay comparable. Greece is the default
 * because it is the exit point verified to get past their rate limiting;
 * prices still return in USD regardless, so conversion is still needed.
 */
export async function startRun(
  token: string,
  run: PlannedRun,
  opts: { country?: string } = {}
): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrl: run.url,
      results_wanted: 60,
      max_pages: 3,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
        apifyProxyCountry: opts.country ?? "GR",
      },
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

/** vehicleAttributes reads e.g. "5, 5 Doors, Air Conditioning, Unlimited mileage, Automatic". */
function transmissionFrom(attrs: unknown): string | null {
  const t = String(attrs ?? "");
  if (/automatic/i.test(t)) return "Αυτόματο";
  if (/manual/i.test(t)) return "Χειροκίνητο";
  return null;
}

interface CarRentalsItem {
  vendorName?: string;
  vehicleCategory?: string;
  vehicleDescription?: string;
  vehicleAttributes?: string;
  priceLeadAmount?: number;
  priceTotalAmount?: number;
  priceCurrency?: string;
}

/**
 * Maps the actor's dataset into competitor_rates.
 *
 * Fields are mapped explicitly against the shape the actor actually returns.
 * A loose key search is unsafe here: searching for a key containing "name" to
 * find the model matches `vendorName` first, which would store every car as
 * its rental company.
 *
 * price_per_day is the total divided by the rental length rather than the
 * advertised `priceLeadAmount`, because the total is what the customer pays —
 * carrentals.com states the total "includes taxes and fees", and the two differ
 * by roughly 9%.
 */
export async function ingestDataset(
  token: string,
  datasetId: string,
  run: PlannedRun,
  rate: number
): Promise<number> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`);
  if (!res.ok) throw new Error(`Dataset fetch failed (${res.status})`);
  const items: CarRentalsItem[] = await res.json();
  if (!Array.isArray(items) || !items.length) {
    throw new Error(`Actor returned an empty dataset for ${run.checkIn} ${run.days}d — check the run log in Apify.`);
  }

  const rows = items.map(it => {
    const supplier = (it.vendorName ?? "").trim();
    const model = (it.vehicleDescription ?? "").trim();
    const total = num(it.priceTotalAmount);
    const lead = num(it.priceLeadAmount);
    const perDay = total !== null && run.days > 0 ? total / run.days : lead;

    return {
      competitor: COMPETITOR.slug,
      competitor_label: COMPETITOR.label,
      source: "carrentals",
      pickup_date: run.checkIn,
      return_date: addDays(run.checkIn, run.days),
      duration_days: run.days,
      duration_band: durationBand(run.days),
      pickup_location: LOCATION,
      // Transmission belongs in the name: the same vendor and model is listed
      // twice, once manual once automatic, at materially different prices.
      // Without it both rows collide on the storage key and Postgres rejects
      // the whole batch with "ON CONFLICT DO UPDATE command cannot affect row
      // a second time".
      vehicle_name: [supplier, model].filter(Boolean).join(" — ").slice(0, 140) +
        (transmissionFrom(it.vehicleAttributes) === "Αυτόματο" ? " (Automatic)"
          : transmissionFrom(it.vehicleAttributes) === "Χειροκίνητο" ? " (Manual)" : ""),
      manufacturer: supplier || null,
      car_group: (it.vehicleCategory ?? "").trim() || null,
      transmission: transmissionFrom(it.vehicleAttributes),
      category: "Car",
      // Converted so it sits alongside every other competitor in EUR.
      price_per_day: perDay === null ? null : Math.round(perDay * rate * 100) / 100,
      total_price: total === null ? null : Math.round(total * rate * 100) / 100,
      original_price: lead === null ? null : Math.round(lead * rate * 100) / 100,
      currency: "EUR",
      scraped_at: new Date().toISOString(),
    };
  }).filter(r => r.vehicle_name && r.price_per_day !== null);

  // Belt and braces: any remaining key collision would still abort the batch,
  // so keep the cheapest offer per vehicle.
  const unique = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const prev = unique.get(r.vehicle_name);
    if (!prev || (r.price_per_day ?? Infinity) < (prev.price_per_day ?? Infinity)) {
      unique.set(r.vehicle_name, r);
    }
  }
  const deduped = [...unique.values()];

  if (!rows.length) {
    throw new Error(
      `No usable rows. First record had keys: ${Object.keys(items[0]).slice(0, 12).join(", ")}`
    );
  }

  const { error } = await supabaseAdmin
    .from("competitor_rates")
    .upsert(deduped, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });
  if (error) throw new Error(`Storing CarRentals rates failed: ${error.message}`);

  return deduped.length;
}
