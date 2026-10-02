import { supabaseAdmin } from "@/lib/supabase";
import { durationBand } from "@/lib/competitorRates";
import { TIMEOUTS, boundedFetch } from "@/lib/boundedFetch";

/**
 * Scooter rates from Rent Scooter Car Zante (Keri Road, Zakynthos).
 *
 * **The first motorbike source besides Ionian Rentals**, and the reason W22 took
 * three attempts: almost nobody on this island publishes motorbike prices in a
 * form a plain request can read. Blueprint §1.6a has the survey — Auto Traffic
 * quotes by enquiry form, ZanteWay prints "From 0.00 € / Day", Famozo and
 * Riderly keep their rates behind a private API and a bot challenge
 * respectively. This operator simply publishes a tariff, so reading it needs no
 * browser, no vendor and no spend.
 *
 * `robots.txt` is `User-agent: *` with no `Disallow` and no `Crawl-Delay`, so
 * everything is permitted; the page is one fetch and the bot identifies itself
 * honestly, as the other three scrapers do.
 *
 * **Why this source fits the comparison better than the others.** It publishes
 * both a season and a duration band, where Faros needed a synthetic proxy for
 * short rentals. Their bands are 1–3, 4–6 and 7+ days, and the three durations
 * this project already samples — 2, 5 and 10 days, `DURATIONS` in
 * `lib/competitorRates.ts` — fall one inside each. So the mapping is exact
 * rather than approximate, and `pickBandDays` refuses to guess if they ever
 * change the bands.
 */

const COMPETITOR = { slug: "rentscooterzante", label: "Rent Scooter Car Zante" };

/** The `source` written on every row, and the key in `RATE_SOURCES`. */
export const SOURCE = "rentscooterzante";

export const TARIFF_URL = "https://www.rentscootercarzante.com/tariffe-scooter/";

export type Season = "bassa" | "alta";

/**
 * Their seasons, as the tariff page states them:
 * *"BASSA STAGIONE: Maggio, Giugno e Settembre | ALTA STAGIONE: dal 1 luglio al
 * 31 Agosto"*.
 *
 * **October is deliberately absent, and so is everything before May.** They
 * publish no price for those months, so none is stored — a comparison month
 * with no row from them is honest, where an invented shoulder-season figure
 * would not be. That does mean this source cannot answer an October comparison,
 * which is worth knowing before reading the Market screen.
 */
export const SEASON_MONTHS: Record<Season, number[]> = {
  bassa: [5, 6, 9],
  alta: [7, 8],
};

/** The durations this project samples, from `lib/competitorRates.ts`. */
const SAMPLED_DAYS = [2, 5, 10] as const;

export interface PublishedBand {
  /** Lowest day count the band covers. */
  min: number;
  /** Highest day count, or null for an open-ended "7 giorni +". */
  max: number | null;
}

/**
 * Reads a band header such as `1-3 giorni`, `4-6 Giorni` or `7 Giorni +`.
 *
 * Returns null rather than guessing when the header is not a band — the header
 * row's first cell is `STAGIONE`, and the mobile copy of each table uses the
 * season names there instead.
 */
export function parseBandHeader(text: string): PublishedBand | null {
  const open = /(\d+)\s*(?:giorni|giorno)?\s*\+/i.exec(text);
  if (open) return { min: Number(open[1]), max: null };
  const range = /(\d+)\s*[-–]\s*(\d+)/.exec(text);
  if (!range) return null;
  const min = Number(range[1]);
  const max = Number(range[2]);
  return max >= min ? { min, max } : null;
}

/**
 * The sampled duration that falls inside a published band, or null.
 *
 * Null is the important case: it means their bands no longer line up with the
 * durations we sample, and the right response is to skip that column and say so
 * rather than to store a figure against a duration it was not quoted for.
 */
export function pickBandDays(band: PublishedBand): number | null {
  const inside = SAMPLED_DAYS.filter(d => d >= band.min && (band.max === null || d <= band.max));
  // Exactly one sampled duration per band is the expected shape. Two would make
  // the choice arbitrary, so it is refused for the same reason as none.
  return inside.length === 1 ? inside[0] : null;
}

/** `50 cc` from `Aprilia Sr Motard 50 cc`. Null when the name states no size. */
export function engineCc(model: string): number | null {
  const sizes = [...model.matchAll(/(\d{2,4})\s*cc/gi)].map(m => Number(m[1]));
  if (!sizes.length) return null;
  // A group can list several models — "Piaggio liberty s 125 cc , Aprilia
  // sportcity 125 cc, Derbi variant 125 cc". They are grouped precisely because
  // they share a price and a class, so the smallest is the class: it is the one
  // figure that is true of every model in the group.
  return Math.min(...sizes);
}

/**
 * The group a scooter is compared as — what the Market mapping table maps.
 *
 * Stored as the engine class rather than the model, because that is the unit
 * their tariff prices and the unit our own rate card sells: Motorbike A is the
 * 50cc, Motorbike B is everything above it.
 */
export function engineClass(cc: number | null): string {
  return cc === null ? "unknown" : `${cc} cc`;
}

export interface TariffEntry {
  model: string;
  cc: number | null;
  season: Season;
  days: number;
  pricePerDay: number;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** `€ 17/giorno` → 17. Also tolerates `€17.00`, `17,50 €`. */
export function parsePrice(text: string): number | null {
  const m = /(\d+(?:[.,]\d{1,2})?)/.exec(text.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SEASONS: Record<string, Season> = { bassa: "bassa", alta: "alta" };

/**
 * Every published price on the scooter tariff page.
 *
 * **Each table is on the page twice** — once with the seasons as rows and the
 * durations as columns, and once transposed for narrow screens. They are not
 * distinguished by any class, so the parser reads the header row instead: the
 * season-major copy has duration bands in its `<th>`s, the transposed copy has
 * season names. Only the first shape is read, which drops the duplicate without
 * having to guess which table came first.
 */
export function parseScooterTariff(html: string): TariffEntry[] {
  const entries: TariffEntry[] = [];
  // A model heading followed by its table. Elementor emits the name in an
  // <h1>-<h6> heading widget immediately before the table widget.
  const blocks = [
    ...html.matchAll(
      /<h[1-6][^>]*elementor-heading-title[^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*elementor-heading-title|$)/g
    ),
  ];

  for (const block of blocks) {
    const model = stripTags(block[1]);
    const table = /<table[^>]*>([\s\S]*?)<\/table>/.exec(block[2]);
    if (!model || !table) continue;

    const headers = [...table[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => stripTags(m[1]));
    if (headers.length < 2) continue;

    // Columns 1..n are the bands; column 0 is the season label.
    const bands = headers.slice(1).map(parseBandHeader);
    if (!bands.some(Boolean)) continue; // the transposed copy

    const cc = engineCc(model);

    for (const row of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));
      if (cells.length < 2) continue;
      const season = SEASONS[cells[0].toLowerCase()];
      if (!season) continue;

      bands.forEach((band, i) => {
        if (!band) return;
        const days = pickBandDays(band);
        const price = parsePrice(cells[i + 1] ?? "");
        if (days === null || price === null) return;
        entries.push({ model, cc, season, days, pricePerDay: price });
      });
    }
  }

  return entries;
}

/**
 * The next occurrence of a month, as a `YYYY-MM-15` date.
 *
 * A published tariff has no date of its own, so a date has to be chosen for the
 * row. The upcoming occurrence is the honest one: this is what they charge for
 * that month next time it comes round. The Market comparison buckets by month
 * and ignores the year, so this changes nothing there — it only stops a row
 * claiming to describe a month that has already been and gone.
 */
export function seasonPickupDate(month: number, now: Date): string {
  const y = now.getUTCFullYear();
  const year = month >= now.getUTCMonth() + 1 ? y : y + 1;
  return `${year}-${String(month).padStart(2, "0")}-15`;
}

async function fetchTariff(url: string, timeoutMs: number = TIMEOUTS.scrape): Promise<string> {
  const res = await boundedFetch(
    "Rent Scooter Car Zante tariff",
    url,
    {
      headers: {
        // Identify honestly rather than impersonating a browser — the same
        // position as the other three scrapers, and the reason Riderly was
        // rejected as a target rather than merely found difficult.
        "User-Agent": "AnadyonRatesBot/1.0 (+https://anadyon.gr; rate comparison)",
        Accept: "text/html",
      },
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`Rent Scooter Car Zante returned ${res.status}`);
  return res.text();
}

export interface RentScooterZanteResult {
  models: number;
  stored: number;
  months: number[];
  errors: string[];
}

/**
 * Collects the published scooter tariff and stores one row per model, month and
 * sampled duration.
 *
 * `total_price` is the per-day rate times the duration, which is what their
 * tariff means: the bands are a per-day price for a rental of that length, not
 * a package.
 */
export async function collectRentScooterZante(
  now: Date = new Date(),
  /** Budget for the single tariff fetch; the scrape route narrows it. */
  timeoutMs: number = TIMEOUTS.scrape,
): Promise<RentScooterZanteResult> {
  const result: RentScooterZanteResult = { models: 0, stored: 0, months: [], errors: [] };

  let entries: TariffEntry[];
  try {
    entries = parseScooterTariff(await fetchTariff(TARIFF_URL, timeoutMs));
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "fetch failed");
    return result;
  }

  if (!entries.length) {
    result.errors.push("no tariff rows parsed — the page layout may have changed");
    return result;
  }

  result.models = new Set(entries.map(e => e.model)).size;
  const scrapedAt = now.toISOString();
  const rows: Record<string, unknown>[] = [];
  const months = new Set<number>();

  for (const entry of entries) {
    for (const month of SEASON_MONTHS[entry.season]) {
      months.add(month);
      const pickup = seasonPickupDate(month, now);
      const ret = new Date(`${pickup}T00:00:00Z`);
      ret.setUTCDate(ret.getUTCDate() + entry.days);
      rows.push({
        competitor: COMPETITOR.slug,
        competitor_label: COMPETITOR.label,
        source: SOURCE,
        pickup_date: pickup,
        return_date: ret.toISOString().slice(0, 10),
        duration_days: entry.days,
        duration_band: durationBand(entry.days),
        pickup_location: "Keri, Zakynthos",
        vehicle_name: entry.model.slice(0, 140),
        car_group: engineClass(entry.cc),
        category: "Scooter",
        price_per_day: entry.pricePerDay,
        total_price: Math.round(entry.pricePerDay * entry.days * 100) / 100,
        currency: "EUR",
        scraped_at: scrapedAt,
      });
    }
  }

  const { error } = await supabaseAdmin
    .from("competitor_rates")
    .upsert(rows, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });
  if (error) throw new Error(`Storing Rent Scooter Car Zante rates failed: ${error.message}`);

  result.stored = rows.length;
  result.months = [...months].sort((a, b) => a - b);
  return result;
}
