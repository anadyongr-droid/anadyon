import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { RATE_SOURCES, describeSource, type SourceFreshness } from "@/lib/rateSourceFreshness";

// Admin-only via proxy.ts.
export const dynamic = "force-dynamic";

interface Rate {
  id: string;
  pricing_group: string;
  season_name: string;
  season_months: number[];
  rate_1_2: number;
  rate_3_6: number;
  rate_7plus: number;
}

const BANDS = [
  { key: "1_2", label: "1–2 days", field: "rate_1_2" },
  { key: "3_6", label: "3–6 days", field: "rate_3_6" },
  { key: "7plus", label: "7+ days", field: "rate_7plus" },
] as const;

/**
 * When each import source was last collected.
 *
 * One query per source, each asking only for the newest row. That is more round
 * trips than a single grouped query, but it is exactly right at any table size:
 * PostgREST caps an unbounded select at 1,000 rows, so reducing a fetched page
 * down to a maximum per source would silently report the wrong date once the
 * table outgrew the cap — and report it with no sign that anything was missing.
 * Four indexed single-row reads cost less than being quietly wrong.
 *
 * The list of sources comes from the importers rather than from the data, so a
 * source that has never run reports "never imported" instead of vanishing.
 */
async function loadFreshness(now: Date): Promise<SourceFreshness[]> {
  return Promise.all(
    RATE_SOURCES.map(async src => {
      const { data } = await supabaseAdmin
        .from("competitor_rates")
        .select("scraped_at")
        .eq("source", src.source)
        .order("scraped_at", { ascending: false })
        .limit(1);
      return describeSource(src, data?.[0]?.scraped_at ?? null, now);
    })
  );
}

/**
 * Our rate beside each competitor's, for every mapped group.
 *
 * Competitor observations are averaged within a group: a group holds several
 * vehicles at the same price point, and averaging avoids a single odd listing
 * skewing the comparison.
 */
export async function GET() {
  const now = new Date();
  const [{ data: rates }, { data: obs, error }, sources] = await Promise.all([
    supabaseAdmin.from("rates").select("*"),
    supabaseAdmin
      .from("competitor_rates")
      .select("competitor, competitor_label, pricing_group, pickup_date, duration_band, price_per_day")
      .not("pricing_group", "is", null),
    // Deliberately independent of the mapping filter above. How old the data is
    // is a fact about the import, not about whether a category has been mapped
    // yet — and an unmapped import is exactly when "did it even run?" is asked.
    loadFreshness(now),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const competitors = [
    ...new Map((obs ?? []).map(o => [o.competitor, o.competitor_label])).entries(),
  ].map(([slug, label]) => ({ slug, label }));

  // Bucket competitor prices by group + month + band
  const buckets = new Map<string, number[]>();
  for (const o of obs ?? []) {
    if (typeof o.price_per_day !== "number") continue;
    const month = new Date(o.pickup_date).getMonth() + 1;
    const key = `${o.pricing_group}|${month}|${o.duration_band}|${o.competitor}`;
    const arr = buckets.get(key) ?? [];
    arr.push(o.price_per_day);
    buckets.set(key, arr);
  }

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // Only months we actually collected
  const months = [...new Set((obs ?? []).map(o => new Date(o.pickup_date).getMonth() + 1))].sort(
    (a, b) => a - b
  );
  const monthName = (m: number) =>
    ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m];

  const rows = [];
  for (const rate of (rates ?? []) as Rate[]) {
    for (const month of months) {
      if (!rate.season_months.includes(month)) continue;
      for (const band of BANDS) {
        const ours = rate[band.field] as number;
        const theirs = competitors.map(c => {
          const values = buckets.get(`${rate.pricing_group}|${month}|${band.key}|${c.slug}`);
          const price = values?.length ? avg(values) : null;
          return {
            competitor: c.slug,
            label: c.label,
            price: price === null ? null : Math.round(price * 100) / 100,
            diffPct:
              price === null || !price ? null : Math.round(((ours - price) / price) * 100),
          };
        });

        if (theirs.every(t => t.price === null)) continue;

        rows.push({
          rate_id: rate.id,
          rate_field: band.field,
          pricing_group: rate.pricing_group,
          season_name: rate.season_name,
          month,
          month_name: monthName(month),
          band: band.key,
          band_label: band.label,
          ours,
          competitors: theirs,
        });
      }
    }
  }

  return NextResponse.json({
    competitors,
    rows,
    mapped: (obs ?? []).length,
    sources,
    ranAt: now.toISOString(),
  });
}
