/**
 * How old the competitor rate data is, per import source.
 *
 * The Market screen sets our prices beside theirs, but said nothing about when
 * "theirs" was collected — so a comparison against August observations read
 * exactly like a comparison against this morning's. The observations have
 * carried `scraped_at` since migration 004 (`competitor_rates`); nothing ever
 * surfaced it, which is a presentation gap rather than a missing measurement.
 *
 * Grouped by `source` rather than by competitor, because that is what an import
 * actually is: one EzCar pass collects Ionian Rentals and Motor Club Zante
 * together from a single button, so those two can never hold different ages,
 * and reporting them separately would invite the reader to believe they could.
 */

export interface RateSource {
  /** The `source` column written by the importer that collects it. */
  source: string;
  label: string;
}

/**
 * Listed here rather than derived from the stored rows on purpose.
 *
 * Deriving the list from `competitor_rates` can only ever describe sources that
 * have been imported at least once — a source that has *never* run simply would
 * not appear, which is precisely the case the admin most needs to see. The
 * slugs and labels mirror the importers: `lib/competitorRates.ts`,
 * `lib/farosRates.ts`, `lib/carRentalsRates.ts`, `lib/podilatadikoRates.ts`.
 */
export const RATE_SOURCES: RateSource[] = [
  { source: "ezcar", label: "Ionian Rentals & Motor Club Zante" },
  { source: "faros", label: "Faros Rentals" },
  { source: "carrentals", label: "CarRentals.com (majors)" },
  { source: "podilatadiko", label: "Podilatadiko (bicycles)" },
];

export type Staleness = "never" | "fresh" | "ageing" | "stale";

export interface SourceFreshness {
  source: string;
  label: string;
  /** ISO timestamp of the most recent observation, or null if never imported. */
  lastImported: string | null;
  /** Whole days elapsed, or null if never imported. */
  ageDays: number | null;
  staleness: Staleness;
}

/**
 * Rates move with the season and with how full the competition is, so a pass
 * from last week still describes roughly today's market and one from last month
 * does not. These two numbers are a judgement, not a measurement — they are
 * named constants so that changing them is one edit and an obvious one.
 */
export const AGEING_AFTER_DAYS = 7;
export const STALE_AFTER_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between the import and now.
 *
 * Floored, so "2.9 days ago" reads as 2 rather than 3 — an age shown older than
 * it is would push someone into re-importing needlessly, and one shown younger
 * would let stale data pass. Floor errs toward the second, which is why the
 * banding below is deliberately generous rather than tight.
 *
 * A timestamp in the future (clock skew between the database and the server)
 * clamps to 0 rather than going negative, which would otherwise render as
 * "-1 days ago".
 */
export function ageInDays(lastImported: string | null, now: Date): number | null {
  if (!lastImported) return null;
  const then = new Date(lastImported);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY));
}

export function classifyAge(ageDays: number | null): Staleness {
  if (ageDays === null) return "never";
  if (ageDays <= AGEING_AFTER_DAYS) return "fresh";
  if (ageDays <= STALE_AFTER_DAYS) return "ageing";
  return "stale";
}

export function describeSource(
  src: RateSource,
  lastImported: string | null,
  now: Date
): SourceFreshness {
  const ageDays = ageInDays(lastImported, now);
  return {
    source: src.source,
    label: src.label,
    // A timestamp that failed to parse is reported as never imported rather
    // than as an age of NaN days.
    lastImported: ageDays === null ? null : lastImported,
    ageDays,
    staleness: classifyAge(ageDays),
  };
}

/** "today" / "yesterday" / "6 days ago" — the phrasing used beside the date. */
export function relativeAge(ageDays: number | null): string {
  if (ageDays === null) return "never imported";
  if (ageDays === 0) return "today";
  if (ageDays === 1) return "yesterday";
  return `${ageDays} days ago`;
}

export interface FreshnessSummary {
  /** The worst state across all sources — what the headline should report. */
  staleness: Staleness;
  /** Age of the *oldest* source that has ever been imported, if any. */
  oldestAgeDays: number | null;
  /** Sources that have never been imported at all. */
  neverImported: string[];
}

/**
 * The single line an admin reads before trusting the comparison.
 *
 * It reports the **oldest** source rather than the newest, because the table
 * mixes all of them in one grid: refreshing EzCar this morning does not make a
 * three-month-old Faros column current, and a headline quoting the newest would
 * say exactly that.
 */
export function summariseFreshness(sources: SourceFreshness[]): FreshnessSummary {
  const neverImported = sources.filter(s => s.ageDays === null).map(s => s.label);
  const ages = sources.map(s => s.ageDays).filter((d): d is number => d !== null);
  const oldestAgeDays = ages.length ? Math.max(...ages) : null;

  // A source that has never run is worse than any age, so it wins the headline.
  const staleness: Staleness = neverImported.length
    ? "never"
    : classifyAge(oldestAgeDays);

  return { staleness, oldestAgeDays, neverImported };
}
