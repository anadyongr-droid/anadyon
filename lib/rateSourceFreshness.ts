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
  /**
   * The same instant as a date in the business's timezone, formatted server-
   * side so it cannot disagree with `ageDays` — the two used to be computed
   * from different clocks.
   */
  lastImportedLabel: string | null;
  /** Whole calendar days, or null if never imported. */
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
 * The fleet is in Zakynthos and so is everyone reading this screen, so a date
 * and an age are both stated in the island's calendar rather than the viewer's
 * or the server's. Matches `lib/bookingEmails.ts` and the admin modals.
 */
export const BUSINESS_TIME_ZONE = "Europe/Athens";

/** The calendar date a timestamp falls on in a given zone, as UTC midnight. */
function calendarDay(d: Date, timeZone: string): number {
  // en-CA formats as YYYY-MM-DD, which is the only reason to choose that locale.
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-")
    .map(Number);
  // Anchoring both ends at UTC midnight makes the subtraction exact: a day that
  // is 23 or 25 hours long across a DST change still counts as one day.
  return Date.UTC(y, m - 1, day);
}

/**
 * Whole calendar days between the import and now, in the business's timezone.
 *
 * **Counted in calendar days, not elapsed 24-hour periods, and that is the
 * whole point.** Elapsed-time arithmetic disagrees with the date printed beside
 * it: two imports 90 minutes apart either side of midnight show as different
 * dates but floor to the same number of elapsed days, which is exactly what put
 * "16 Aug · 42 days ago" next to "17 Aug · 42 days ago" on the Market screen.
 * One of those is wrong and the reader cannot tell which.
 *
 * Counting the dates themselves makes the two agree by construction: if the
 * dates differ by one, so does the age. It also removes the zone mismatch —
 * the age was computed on the server in UTC while the date was formatted in the
 * browser's zone, so the pair could disagree by a day for a viewer outside
 * Greece even when nothing was near midnight.
 *
 * A timestamp in the future (clock skew between the database and the server)
 * clamps to 0 rather than going negative, which would render as "-1 days ago".
 */
export function ageInDays(
  lastImported: string | null,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE
): number | null {
  if (!lastImported) return null;
  const then = new Date(lastImported);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.round((calendarDay(now, timeZone) - calendarDay(then, timeZone)) / MS_PER_DAY));
}

/**
 * "17 Aug 2026", in the business's timezone.
 *
 * Formatted here rather than in the browser so the date and the age are
 * computed from the same clock. Rendering the date client-side was the other
 * half of the disagreement above.
 */
export function formatImportDate(
  lastImported: string,
  timeZone: string = BUSINESS_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(lastImported));
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
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE
): SourceFreshness {
  const ageDays = ageInDays(lastImported, now, timeZone);
  // A timestamp that failed to parse is reported as never imported rather than
  // as an age of NaN days.
  const usable = ageDays === null ? null : lastImported;
  return {
    source: src.source,
    label: src.label,
    lastImported: usable,
    lastImportedLabel: usable === null ? null : formatImportDate(usable, timeZone),
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
