import { supabaseAdmin } from "@/lib/supabase";
import { durationBand } from "@/lib/competitorRates";

/**
 * Bicycle rates from Podilatadiko (Cycling Center Zakynthos).
 *
 * They are the closest comparison we have on the bicycle side — a specialist
 * shop rather than a general rental firm, so their range runs far above ours at
 * the top end. The useful comparison is at the bottom: their plain trekking and
 * city bikes sit against our own hire fleet, while the carbon road bikes are a
 * different business entirely and are collected only so the spread is visible.
 *
 * Rates are published as static prices on three category pages rather than
 * behind a booking engine, so no date search is involved and nothing needs a
 * browser. robots.txt (Yoast, `Disallow:` empty) permits all crawling.
 */

const COMPETITOR = { slug: "podilatadiko", label: "Podilatadiko (Cycling Center)" };
const BASE = "https://podilatadiko.com/en-bike-rentals";

/** Their own categories. `segment` is what we store, since "road" and "city" price very differently. */
export const PODILATADIKO_PAGES = [
  { path: "en-road-bikes", segment: "Road" },
  { path: "en-mountain-bikes", segment: "Mountain" },
  { path: "en-touring-bikes", segment: "Touring" },
] as const;

/** Politeness gap between page fetches. Their robots.txt sets no Crawl-Delay. */
export const PAGE_DELAY_MS = 3_000;

export interface BikeOffer {
  name: string;
  segment: string;
  /** Rental length in days → total price for that length, as published. */
  tiers: Map<number, number>;
}

export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&quot;|&#8221;|&#8220;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Each model is an Elementor `<h3 class="elementor-heading-title">`, and its
 * prices are the text between that heading and the next one.
 *
 * Prices read "1 day € 50  2 days € 100  3 days € 150" — the euro sign trails
 * the duration rather than leading the amount, which is why a conventional
 * currency-first pattern finds nothing on this page.
 */
export function parseBikePage(html: string, segment: string): BikeOffer[] {
  const headings = [...html.matchAll(/<h3[^>]*elementor-heading-title[^>]*>([\s\S]*?)<\/h3>/g)];
  const offers: BikeOffer[] = [];

  for (let i = 0; i < headings.length; i++) {
    const name = stripTags(headings[i][1]);
    if (!name) continue;

    const from = headings[i].index! + headings[i][0].length;
    const to = i + 1 < headings.length ? headings[i + 1].index! : html.length;
    const block = stripTags(html.slice(from, to));

    const tiers = new Map<number, number>();
    for (const m of block.matchAll(/(\d+)\s*days?\s*€\s*([\d]+(?:[.,]\d{1,2})?)/gi)) {
      const days = Number(m[1]);
      const price = Number(m[2].replace(",", "."));
      // First price wins: a "Special Offer" repeat of the same duration later in
      // the block should not overwrite the standard rate.
      if (days > 0 && price > 0 && !tiers.has(days)) tiers.set(days, price);
    }

    if (tiers.size) offers.push({ name, segment, tiers });
  }

  return offers;
}

async function fetchPage(path: string): Promise<string> {
  const res = await fetch(`${BASE}/${path}/`, {
    headers: {
      // Identify honestly rather than impersonating a browser.
      "User-Agent": "AnadyonRatesBot/1.0 (+https://anadyon.gr; rate comparison)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Podilatadiko ${path} returned ${res.status}`);
  return res.text();
}

export interface PodilatadikoResult {
  models: number;
  stored: number;
  segments: string[];
  errors: string[];
}

/**
 * Collects all three category pages and stores one row per model per duration.
 *
 * There is no pickup date involved — the prices are a published tariff, not a
 * live search — so `pickup_date` records the day it was collected. That keeps
 * the row shape identical to every other competitor and lets the Market screen
 * treat them all the same way.
 */
export async function collectPodilatadiko(): Promise<PodilatadikoResult> {
  const today = new Date().toISOString().slice(0, 10);
  const result: PodilatadikoResult = { models: 0, stored: 0, segments: [], errors: [] };
  const rows: Record<string, unknown>[] = [];

  for (const [i, page] of PODILATADIKO_PAGES.entries()) {
    if (i > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    try {
      const offers = parseBikePage(await fetchPage(page.path), page.segment);
      if (!offers.length) {
        result.errors.push(`${page.segment}: no models parsed — page layout may have changed`);
        continue;
      }
      result.models += offers.length;
      result.segments.push(`${page.segment} ${offers.length}`);

      for (const offer of offers) {
        for (const [days, total] of offer.tiers) {
          const returnDate = new Date(`${today}T00:00:00Z`);
          returnDate.setUTCDate(returnDate.getUTCDate() + days);
          rows.push({
            competitor: COMPETITOR.slug,
            competitor_label: COMPETITOR.label,
            source: "podilatadiko",
            pickup_date: today,
            return_date: returnDate.toISOString().slice(0, 10),
            duration_days: days,
            duration_band: durationBand(days),
            pickup_location: "Zakynthos Town",
            // Duration is part of the name because the storage key is
            // competitor+date+duration+name, and the same model appears at
            // every tier — without it the tiers overwrite one another.
            vehicle_name: `${offer.name} (${days}d)`.slice(0, 140),
            car_group: offer.segment,
            category: "Bicycle",
            price_per_day: Math.round((total / days) * 100) / 100,
            total_price: total,
            currency: "EUR",
            scraped_at: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      result.errors.push(`${page.segment}: ${err instanceof Error ? err.message : "fetch failed"}`);
    }
  }

  if (!rows.length) return result;

  const { error } = await supabaseAdmin
    .from("competitor_rates")
    .upsert(rows, { onConflict: "competitor,pickup_date,duration_days,vehicle_name" });
  if (error) throw new Error(`Storing Podilatadiko rates failed: ${error.message}`);

  result.stored = rows.length;
  return result;
}
