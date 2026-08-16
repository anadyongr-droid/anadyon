import { supabaseAdmin } from "@/lib/supabase";

/**
 * Competitor rate collection from the EzCar booking platform.
 *
 * Ionian Rentals and Motor Club Zante both run on ezcar.eu, so one parser
 * serves both — only the tenant path differs.
 *
 * ezcar.eu/robots.txt sets `Crawl-Delay: 10` with no Disallow. That delay is
 * honoured strictly between every request, which is why work is done in small
 * batches rather than one long run.
 */

export interface EzcarTenant {
  slug: string;
  label: string;
  path: string;
  /**
   * EzCar location ids are per-tenant, not global — sending another tenant's id
   * silently returns an empty result set rather than an error.
   */
  pickupLoc: string;
  locationLabel: string;
}

export const EZCAR_TENANTS: EzcarTenant[] = [
  {
    slug: "ionianrentals",
    label: "Ionian Rentals",
    path: "ionianrentals",
    pickupLoc: "2",
    locationLabel: "Airport Office",
  },
  {
    slug: "motorclubzante",
    label: "Motor Club Zante",
    path: "motorclubzante",
    pickupLoc: "49",
    locationLabel: "Zakynthos Airport (Our Office)",
  },
];

/** Milliseconds between requests, from ezcar.eu/robots.txt (Crawl-Delay: 10). */
export const CRAWL_DELAY_MS = 10_000;

/** Durations chosen to line up with our own 1-2 / 3-6 / 7+ rate bands. */
export const DURATIONS = [2, 5, 10] as const;

export function durationBand(days: number): "1_2" | "3_6" | "7plus" {
  if (days <= 2) return "1_2";
  if (days <= 6) return "3_6";
  return "7plus";
}

export interface EzcarVehicle {
  name?: string;
  manufacturer?: string;
  category?: string;
  carGroup?: string;
  transmission?: string;
  pricePerDay?: number;
  totalPrice?: number;
  originalPrice?: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** EzCar expects d/m/Y. */
function formatDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildSearchUrl(tenant: EzcarTenant, pickup: Date, days: number): string {
  const dropoff = new Date(pickup);
  dropoff.setDate(dropoff.getDate() + days);

  const params = new URLSearchParams({
    pickup: formatDate(pickup),
    dropoff: formatDate(dropoff),
    pickUpTime: "10:00",
    dropoffTime: "10:00",
    pickuploc: tenant.pickupLoc,
    dropoffloc: tenant.pickupLoc,
    drivers_age: "30",
    is_bike: "0",
  });

  return `https://www.ezcar.eu/${tenant.path}/vehicle.results.php?${params.toString()}`;
}

/**
 * Pulls the `vehicles` array out of the results page.
 *
 * The page embeds its data as a JavaScript array literal, which is far more
 * stable than scraping rendered markup. Bracket matching is string-aware so a
 * `]` inside a vehicle description cannot truncate the array.
 */
export function extractVehicles(html: string): EzcarVehicle[] {
  const marker = /(?:var|let|const)\s+vehicles\s*=\s*\[/.exec(html);
  if (!marker) return [];

  const start = html.indexOf("[", marker.index);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, i + 1));
          return Array.isArray(parsed) ? (parsed as EzcarVehicle[]) : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

export interface ScrapeTask {
  tenant: EzcarTenant;
  pickup: Date;
  days: number;
}

/**
 * The full set of searches to run: every tenant, month and duration.
 * Deterministic, so a cursor into it survives across batched runs.
 */
export function buildTaskMatrix(pickupDates: Date[]): ScrapeTask[] {
  const tasks: ScrapeTask[] = [];
  for (const tenant of EZCAR_TENANTS) {
    for (const pickup of pickupDates) {
      for (const days of DURATIONS) {
        tasks.push({ tenant, pickup, days });
      }
    }
  }
  return tasks;
}

async function fetchResults(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // Identify honestly rather than impersonating a browser.
      "User-Agent": "AnadyonRatesBot/1.0 (+https://anadyon.gr; rate comparison)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`EzCar returned ${res.status}`);
  return res.text();
}

export interface TaskResult {
  competitor: string;
  pickup: string;
  days: number;
  vehicles: number;
  stored: number;
  error?: string;
}

export async function runScrapeTask(task: ScrapeTask): Promise<TaskResult> {
  const { tenant, pickup, days } = task;
  const base: TaskResult = {
    competitor: tenant.slug,
    pickup: toIsoDate(pickup),
    days,
    vehicles: 0,
    stored: 0,
  };

  try {
    const html = await fetchResults(buildSearchUrl(tenant, pickup, days));
    const vehicles = extractVehicles(html);
    base.vehicles = vehicles.length;
    if (!vehicles.length) return base;

    const dropoff = new Date(pickup);
    dropoff.setDate(dropoff.getDate() + days);

    const rows = vehicles
      .filter(v => v.name)
      .map(v => ({
        competitor: tenant.slug,
        competitor_label: tenant.label,
        source: "ezcar",
        pickup_date: toIsoDate(pickup),
        return_date: toIsoDate(dropoff),
        duration_days: days,
        duration_band: durationBand(days),
        pickup_location: tenant.locationLabel,
        vehicle_name: (v.name ?? "").trim().replace(/\s+/g, " "),
        manufacturer: v.manufacturer ?? null,
        car_group: v.carGroup ?? null,
        transmission: v.transmission ?? null,
        category: v.category ?? null,
        price_per_day: typeof v.pricePerDay === "number" ? v.pricePerDay : null,
        total_price: typeof v.totalPrice === "number" ? v.totalPrice : null,
        original_price: typeof v.originalPrice === "number" ? v.originalPrice : null,
        scraped_at: new Date().toISOString(),
      }));

    const { error } = await supabaseAdmin
      .from("competitor_rates")
      .upsert(rows, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });

    if (error) {
      base.error = error.message;
      return base;
    }

    base.stored = rows.length;
    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}
