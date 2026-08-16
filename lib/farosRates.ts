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

/**
 * Faros enforces a three-day minimum, so a genuine 1-2 day quote is impossible.
 * The three-day booking is collected as the closest available stand-in: its
 * per-day figure is the total divided by three.
 *
 * Treat that comparison as conservative rather than like-for-like. Per-day
 * rates fall as duration rises, so a three-day rate sits below whatever Faros
 * would charge for one or two days — which understates them at short lengths.
 */
export const FAROS_DURATIONS = [3, 5, 10] as const;

/** The three-day booking stands in for the short band; the rest map normally. */
function farosBand(days: number): "1_2" | "3_6" | "7plus" {
  return days === 3 ? "1_2" : durationBand(days);
}

export function farosPickupDates(): string[] {
  return ["2026-08-25", "2026-09-15", "2026-10-15"];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Runs INSIDE the browser page, not in Node.
 *
 * apify/web-scraper evaluates this in the page context, so there is no
 * `page` object — that belongs to puppeteer-scraper. Same-origin `fetch` and
 * the page's own `csrf_token` global are directly available here.
 */
function buildPageFunction(searches: { checkIn: string; checkOut: string; days: number }[]): string {
  return `async function pageFunction(context) {
  const searches = ${JSON.stringify(searches)};
  const log = context && context.log;

  // Surfaced in the dataset so a failed run explains itself instead of
  // returning an empty set with no error.
  const diagnostics = {
    diagnostic: true,
    title: document.title,
    hasCsrf: typeof csrf_token !== 'undefined',
    blocked: /403|forbidden|access denied/i.test(document.title || ''),
    url: location.href
  };

  if (typeof csrf_token === 'undefined') {
    return [diagnostics];
  }

  const results = [diagnostics];

  for (let i = 0; i < searches.length; i++) {
    const s = searches[i];
    // Honour the Crawl-delay Faros publishes.
    if (i > 0) await new Promise(r => setTimeout(r, 10000));

    const body = 'key=getVehicles&csrf_token=' + csrf_token +
      '&format=json&checkInDate=' + encodeURIComponent(s.checkIn + ' 10:00:00') +
      '&checkOutDate=' + encodeURIComponent(s.checkOut + ' 10:00:00') +
      '&passengers=${DRIVER_AGE}&type=${CAR_TYPE}';

    let items = [];
    let error = null;
    try {
      const r = await fetch('includes/ajax.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: body
      });
      const t = await r.text();
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) items = j; else error = t.slice(0, 160);
      } catch (e) { error = t.slice(0, 160); }
    } catch (e) {
      error = String(e).slice(0, 160);
    }

    if (log) log.info('Faros ' + s.checkIn + ' ' + s.days + 'd -> ' + items.length);
    results.push({ checkIn: s.checkIn, checkOut: s.checkOut, days: s.days, vehicles: items, error: error });
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
  const flat = Array.isArray(payload) ? payload.flat().filter(Boolean) : [];
  const diagnostic = flat.find((b: { diagnostic?: boolean }) => b?.diagnostic) as
    | { title?: string; hasCsrf?: boolean; blocked?: boolean; url?: string }
    | undefined;

  const blocks: { checkIn: string; checkOut: string; days: number; vehicles: FarosVehicle[]; error?: string }[] =
    flat.filter((b: { vehicles?: unknown }) => Array.isArray(b?.vehicles));

  if (!blocks.length) {
    // Explain why rather than reporting a silent zero.
    if (diagnostic && diagnostic.hasCsrf === false) {
      throw new Error(
        `Faros page loaded but no csrf_token — likely blocked. Title: "${diagnostic.title ?? "?"}"`
      );
    }
    throw new Error("Apify returned no search blocks. The page function may not have run.");
  }

  const firstError = blocks.find(b => b.error)?.error;
  if (firstError && blocks.every(b => !b.vehicles.length)) {
    throw new Error(`Faros API rejected every search: ${firstError}`);
  }

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
          duration_band: farosBand(block.days),
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
