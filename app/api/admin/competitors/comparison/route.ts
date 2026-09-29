import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadRateFreshness } from "@/lib/rateSourceFreshnessQuery";
import { fetchAllRows } from "@/lib/fetchAllRows";

// Admin-only via proxy.ts.
export const dynamic = "force-dynamic";

interface Observation {
  competitor: string;
  competitor_label: string;
  pricing_group: string | null;
  pickup_date: string;
  duration_band: string;
  price_per_day: number | null;
}

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
 * Our rate beside each competitor's, for every mapped group.
 *
 * Competitor observations are averaged within a group: a group holds several
 * vehicles at the same price point, and averaging avoids a single odd listing
 * skewing the comparison.
 */
export async function GET() {
  const now = new Date();
  const [{ data: rates }, observations, sources] = await Promise.all([
    supabaseAdmin.from("rates").select("*"),
    // Paged, and ordered by the primary key so the pages do not overlap.
    // Unbounded, this returned at most 1,000 observations and averaged them as
    // though they were all of them — the comparison would have drifted silently
    // as the table grew, never failing, just quietly describing a slice.
    fetchAllRows<Observation>((from, to) =>
      supabaseAdmin
        .from("competitor_rates")
        .select("competitor, competitor_label, pricing_group, pickup_date, duration_band, price_per_day")
        .not("pricing_group", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    // Deliberately independent of the mapping filter above. How old the data is
    // is a fact about the import, not about whether a category has been mapped
    // yet — and an unmapped import is exactly when "did it even run?" is asked.
    loadRateFreshness(now),
  ]);

  if (observations.error) {
    return NextResponse.json({ error: observations.error }, { status: 500 });
  }
  const obs = observations.rows;

  const competitors = [
    ...new Map(obs.map(o => [o.competitor, o.competitor_label])).entries(),
  ].map(([slug, label]) => ({ slug, label }));

  // Bucket competitor prices by group + month + band
  const buckets = new Map<string, number[]>();
  for (const o of obs) {
    if (typeof o.price_per_day !== "number") continue;
    const month = new Date(o.pickup_date).getMonth() + 1;
    const key = `${o.pricing_group}|${month}|${o.duration_band}|${o.competitor}`;
    const arr = buckets.get(key) ?? [];
    arr.push(o.price_per_day);
    buckets.set(key, arr);
  }

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // Only months we actually collected
  const months = [...new Set(obs.map(o => new Date(o.pickup_date).getMonth() + 1))].sort(
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

  // Sorted here, because the loop above cannot produce calendar order.
  //
  // It iterates `rates` on the outside and months on the inside, and `rates`
  // comes back from `select("*")` with no ORDER BY — so Postgres is free to
  // return the season rows in any order it likes. A pricing group with three
  // seasons therefore emitted its months grouped by season rather than by
  // month: August, then October, then September, which is what was reported
  // from the screen.
  //
  // The months array was already sorted, which is exactly why this was easy to
  // miss — the sort was real, it was just applied one loop too far in.
  //
  // Band order is the declaration order of BANDS (1–2, 3–6, 7+), which is the
  // order a reader expects a duration column in, not alphabetical.
  const bandOrder = new Map(BANDS.map((b, i) => [b.key, i]));
  rows.sort(
    (a, b) =>
      a.pricing_group.localeCompare(b.pricing_group) ||
      a.month - b.month ||
      (bandOrder.get(a.band) ?? 0) - (bandOrder.get(b.band) ?? 0)
  );

  return NextResponse.json({
    competitors,
    rows,
    mapped: obs.length,
    sources,
    // Said out loud rather than left to be inferred. If the page ceiling was
    // ever reached these figures are computed from part of the data, and a
    // screen showing partial numbers as though they were complete is the exact
    // failure the paging was added to remove.
    truncated: observations.truncated,
    ranAt: now.toISOString(),
  });
}
