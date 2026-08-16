import { supabaseAdmin } from "@/lib/supabase";
import { durationBand } from "@/lib/competitorRates";

/**
 * Competitor rate collection from Faros Rentals.
 *
 * Unlike EzCar, Faros cannot be read server-side: every request from a
 * non-browser client is refused with 403, including the plain HTML page with a
 * full browser user-agent. Their robots.txt nonetheless publishes
 * `Allow: /` with `Crawl-delay: 10`, so the stated policy permits crawling
 * while a blanket WAF refuses anything that is not a browser. Apify runs a real
 * browser at that interval rather than forging fingerprints.
 *
 * Their booking API, verified against the live site:
 *
 *   POST /includes/ajax.php
 *   key=getVehicles&csrf_token=<from page>&format=json
 *   &checkInDate=YYYY-MM-DD HH:mm:ss&checkOutDate=…&passengers=<age>&type=16
 *
 * Two behaviours worth knowing: dates without a time component silently return
 * an empty list rather than an error, and Faros enforces a three-day minimum,
 * so there is no equivalent of our 1-2 day band.
 */

const FAROS = { slug: "farosrentals", label: "Faros Rentals" };
const SEARCH_URL = "https://faros-rentals.com/search-vehicles";
const APIFY_ACTOR = "apify~web-scraper";
const DRIVER_AGE = 30;
const CAR_TYPE = 16;

/** Faros requires a minimum of three days, so the 1-2 day band has no counterpart. */
export const FAROS_DURATIONS = [5, 10] as const;

export function farosPickupDates(): string[] {
  return ["2026-08-25", "2026-09-15", "2026-10-15"];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Runs in the Apify browser; must be self-contained. */
function buildPageFunction(searches: { checkIn: string; checkOut: string; days: number }[]): string {
  return `async function pageFunction(context) {
  const { page, log } = context;
  const searches = ${JSON.stringify(searches)};
  const results = [];

  for (let i = 0; i < searches.length; i++) {
    const s = searches[i];
    // Honour the Crawl-delay Faros publishes.
    if (i > 0) await new Promise(r => setTimeout(r, 10000));

    const items = await page.evaluate(async (s) => {
      const body = 'key=getVehicles&csrf_token=' + csrf_token +
        '&format=json&checkInDate=' + encodeURIComponent(s.checkIn + ' 10:00:00') +
        '&checkOutDate=' + encodeURIComponent(s.checkOut + ' 10:00:00') +
        '&passengers=${DRIVER_AGE}&type=${CAR_TYPE}';
      const r = await fetch('includes/ajax.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body
      });
      const t = await r.text();
      try { const j = JSON.parse(t); return Array.isArray(j) ? j : []; } catch { return []; }
    }, s);

    log.info('Faros ' + s.checkIn + ' ' + s.days + 'd -> ' + items.length + ' vehicles');
    results.push({ checkIn: s.checkIn, checkOut: s.checkOut, days: s.days, vehicles: items });
  }

  return results;
}`;
}

export function buildApifyInput() {
  const searches = farosPickupDates().flatMap(d =>
    FAROS_DURATIONS.map(days => ({ checkIn: d, checkOut: addDays(d, days), days }))
  );

  return {
    startUrls: [{ url: SEARCH_URL }],
    pageFunction: buildPageFunction(searches),
    // The site rejects non-browser clients, so a real browser is the point.
    headless: true,
    maxRequestsPerCrawl: 1,
    proxyConfiguration: { useApifyProxy: true },
    pageLoadTimeoutSecs: 60,
    // Long enough for six searches spaced ten seconds apart.
    pageFunctionTimeoutSecs: 180,
  };
}

export async function startFarosRun(token: string): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildApifyInput()),
  });
  if (!res.ok) throw new Error(`Apify start failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { runId: json.data.id, datasetId: json.data.defaultDatasetId };
}

export async function getRunStatus(token: string, runId: string): Promise<{ status: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Apify status failed (${res.status})`);
  const json = await res.json();
  return { status: json.data.status, datasetId: json.data.defaultDatasetId };
}

interface FarosVehicle {
  title?: string;
  vehicleCategory?: string;
  vehicleTransmission?: string;
  pricePerNight?: number;
  totalPrice?: string;
  totalDiscountedPrice?: string;
  days?: number;
  isAvailable?: boolean;
}

/** Faros discounts off the list rate, so the discounted total is what a customer actually pays. */
function effectivePerDay(v: FarosVehicle, days: number): number | null {
  const discounted = Number(v.totalDiscountedPrice);
  if (Number.isFinite(discounted) && discounted > 0 && days > 0) return discounted / days;
  const total = Number(v.totalPrice);
  if (Number.isFinite(total) && total > 0 && days > 0) return total / days;
  return typeof v.pricePerNight === "number" ? v.pricePerNight : null;
}

export async function ingestFarosDataset(token: string, datasetId: string): Promise<{ stored: number; searches: number }> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`);
  if (!res.ok) throw new Error(`Apify dataset fetch failed (${res.status})`);
  const payload = await res.json();

  // web-scraper wraps each pageFunction return value; ours returns an array.
  const blocks: { checkIn: string; checkOut: string; days: number; vehicles: FarosVehicle[] }[] =
    Array.isArray(payload) ? payload.flat().filter(b => b && Array.isArray(b.vehicles)) : [];

  let stored = 0;
  for (const block of blocks) {
    const rows = (block.vehicles ?? [])
      .filter(v => v.title && v.isAvailable !== false)
      .map(v => {
        const perDay = effectivePerDay(v, block.days);
        return {
          competitor: FAROS.slug,
          competitor_label: FAROS.label,
          source: "faros",
          pickup_date: block.checkIn,
          return_date: block.checkOut,
          duration_days: block.days,
          duration_band: durationBand(block.days),
          pickup_location: "Zakynthos Airport",
          vehicle_name: String(v.title).trim().replace(/\s+/g, " "),
          manufacturer: null,
          car_group: v.vehicleCategory ?? null,
          transmission: v.vehicleTransmission === "1" ? "Χειροκίνητο" : v.vehicleTransmission === "2" ? "Αυτόματο" : null,
          category: "Car",
          price_per_day: perDay === null ? null : Math.round(perDay * 100) / 100,
          total_price: Number(v.totalDiscountedPrice) || Number(v.totalPrice) || null,
          original_price: Number(v.totalPrice) || null,
          scraped_at: new Date().toISOString(),
        };
      });

    if (!rows.length) continue;
    const { error } = await supabaseAdmin
      .from("competitor_rates")
      .upsert(rows, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });
    if (error) throw new Error(`Storing Faros rates failed: ${error.message}`);
    stored += rows.length;
  }

  return { stored, searches: blocks.length };
}
