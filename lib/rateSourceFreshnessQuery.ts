import { supabaseAdmin } from "@/lib/supabase";
import { RATE_SOURCES, describeSource, type SourceFreshness } from "@/lib/rateSourceFreshness";
import { readImportLog } from "@/lib/rateImportLog";

/**
 * When each import source was last collected.
 *
 * Lives here rather than in a route because two screens need the same answer:
 * the Market comparison, where it qualifies the numbers being read, and the
 * Settings card, where it sits beside the buttons that do the importing. One
 * query, two callers — the alternative was the same SQL written twice and
 * drifting apart.
 *
 * One indexed single-row read per source. That is more round trips than a
 * single grouped query, but it is exactly right at any table size: PostgREST
 * caps an unbounded select at 1,000 rows, so reducing a fetched page down to a
 * maximum per source would silently report the wrong date once the table
 * outgrew the cap — and report it with no sign anything was missing.
 *
 * The source list comes from the importers rather than from the stored rows, so
 * a source that has never run reports "never imported" instead of vanishing.
 */
export async function loadRateFreshness(now: Date = new Date()): Promise<SourceFreshness[]> {
  // The recorded completion time is the answer. Everything below it is a
  // fallback for sources last imported before the log existed.
  const log = await readImportLog();

  return Promise.all(
    RATE_SOURCES.map(async src => {
      const recorded = log.get(src.source);
      if (recorded) return describeSource(src, recorded, now);

      // Derived from the newest stored row. Flagged, because this is the
      // figure that reported an import run yesterday as having run today: rows
      // are upserted, so re-touching one moves its timestamp with no new data.
      const { data } = await supabaseAdmin
        .from("competitor_rates")
        .select("scraped_at")
        .eq("source", src.source)
        .order("scraped_at", { ascending: false })
        .limit(1);
      return describeSource(src, data?.[0]?.scraped_at ?? null, now, undefined, true);
    })
  );
}
