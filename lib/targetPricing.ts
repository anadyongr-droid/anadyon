/**
 * Proposes a rate card positioned against a competitor.
 *
 * "Be 2% cheaper than Faros for all October rentals" — asked for by Tasos on
 * 28 September, with the four inputs he settled recorded in open item W21 and
 * encoded below.
 *
 * **This module proposes and never applies.** `DEFINING-STATEMENTS.md` §13 puts
 * prices first on the list of things an agent may draft but not deploy without
 * Tasos's explicit approval *of that specific change*. So there is no write
 * path here at all: the caller shows a before/after, the administrator presses
 * the Save that already exists on the Rates editor, and the existing
 * admin-only PATCH does the writing. Approval of this tool is not approval of
 * any price it suggests.
 *
 * It is also deliberately a pure function over the comparison payload the
 * Market screen already loads. Re-querying would mean a second source of truth
 * for "what does Faros charge", and the two would drift.
 */

export type RateField = "rate_1_2" | "rate_3_6" | "rate_7plus";

/** One row of the Market comparison — our price beside each competitor's. */
export interface ComparisonRow {
  rate_id: string;
  rate_field: RateField;
  pricing_group: string;
  month: number;
  month_name: string;
  band: string;
  band_label: string;
  ours: number;
  competitors: { competitor: string; label: string; price: number | null }[];
}

export interface TargetSpec {
  /** Competitor slug, e.g. `farosrentals`. */
  competitor: string;
  /** Signed percentage against them: -2 means 2% cheaper. */
  deltaPct: number;
  /** Calendar months to reprice, 1-12. Empty means every month present. */
  months: number[];
  /** Rounding step in euros. Tasos asked for 0.50 — "rather 18.5". */
  roundTo: number;
}

export interface Proposal {
  rateId: string;
  field: RateField;
  pricingGroup: string;
  month: number;
  monthName: string;
  bandLabel: string;
  current: number;
  /** Their price for this group, month and band. */
  competitor: number;
  proposed: number;
  /** proposed − current, rounded to the cent. Negative is a price cut. */
  change: number;
  /**
   * True for the 1–2 day band against Faros, whose stored figure is their
   * three-day rate divided by three. Faros enforces a three-day minimum, so no
   * genuine 1–2 day quote exists to compare against. Tasos chose to reprice off
   * that proxy; it is flagged so a reader is never told a synthetic number is a
   * quote.
   */
  proxy: boolean;
}

export interface SkippedRow {
  pricingGroup: string;
  monthName: string;
  bandLabel: string;
  reason: string;
}

export interface TargetResult {
  proposals: Proposal[];
  /**
   * Rows deliberately not repriced, with the reason.
   *
   * Kept rather than dropped: a group silently missing from a repricing looks
   * identical to one the tool decided to leave alone, and the difference
   * matters when the output is a price list.
   */
  skipped: SkippedRow[];
}

/**
 * Why a row was not repriced.
 *
 * Named constants rather than inline strings because the screen groups by them.
 * A literal typed twice is a literal that eventually differs by a hyphen, and
 * the symptom would be a skip category silently splitting in two.
 */
export const SKIP_REASONS = {
  outsideMonths: "outside the chosen months",
  noPrice: "no mapped price from this competitor",
  nonPositive: "their price is zero or negative",
  roundsToZero: "rounds to zero or below",
} as const;

/** Rounds to the nearest step, away from zero on a .5 boundary. */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return Math.round(value * 100) / 100;
  return Math.round((value / step) * (1 + Number.EPSILON)) * step;
}

/**
 * The band whose competitor figure is a proxy rather than a quote.
 *
 * Faros alone has a three-day minimum. Naming the rule here rather than
 * hardcoding a competitor at the call site keeps the reason with the exception.
 */
function isProxyBand(competitor: string, band: string): boolean {
  return competitor === "farosrentals" && band === "1_2";
}

/**
 * Computes the proposed rate card.
 *
 * Every row that is not proposed appears in `skipped` with a reason. The three
 * reasons are distinct on purpose: "they do not sell this" is a mapping gap,
 * "outside the chosen months" is the operator's own filter, and "their price is
 * zero" is bad data that must never become our price.
 */
export function computeTargetRates(rows: ComparisonRow[], spec: TargetSpec): TargetResult {
  const proposals: Proposal[] = [];
  const skipped: SkippedRow[] = [];
  const wanted = new Set(spec.months);

  for (const row of rows) {
    const where = {
      pricingGroup: row.pricing_group,
      monthName: row.month_name,
      bandLabel: row.band_label,
    };

    if (wanted.size && !wanted.has(row.month)) {
      skipped.push({ ...where, reason: SKIP_REASONS.outsideMonths });
      continue;
    }

    const theirs = row.competitors.find(c => c.competitor === spec.competitor);
    if (!theirs || theirs.price === null) {
      skipped.push({ ...where, reason: SKIP_REASONS.noPrice });
      continue;
    }
    if (!(theirs.price > 0)) {
      // A zero or negative would propose a free rental. Refused rather than
      // rounded away, because a price of 0.00 that reaches the rate card is
      // worse than a gap in the proposal.
      skipped.push({ ...where, reason: SKIP_REASONS.nonPositive });
      continue;
    }

    const target = theirs.price * (1 + spec.deltaPct / 100);
    const proposed = roundToStep(target, spec.roundTo);

    if (!(proposed > 0)) {
      skipped.push({ ...where, reason: SKIP_REASONS.roundsToZero });
      continue;
    }

    proposals.push({
      rateId: row.rate_id,
      field: row.rate_field,
      ...where,
      month: row.month,
      current: row.ours,
      competitor: theirs.price,
      proposed,
      change: Math.round((proposed - row.ours) * 100) / 100,
      proxy: isProxyBand(spec.competitor, row.band),
    });
  }

  return { proposals, skipped };
}

/**
 * Folds proposals into a copy of the rate rows, for the editor to display.
 *
 * Returns a new array; the caller's drafts are not mutated. A rate row not
 * named by any proposal is passed through untouched, so repricing one month
 * never silently rewrites another.
 *
 * The constraint is `{ id: string }` and nothing more on purpose. Adding
 * `& Record<string, unknown>` reads like a harmless description of a rate row,
 * but an `interface` has no implicit index signature — so it would reject
 * `Rate` from `lib/pricing.ts`, which is the only thing this is ever called
 * with. The field write casts anyway.
 */
export function applyProposals<T extends { id: string }>(
  rates: T[],
  proposals: Proposal[]
): T[] {
  const byRate = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const list = byRate.get(p.rateId) ?? [];
    list.push(p);
    byRate.set(p.rateId, list);
  }

  return rates.map(rate => {
    const forThis = byRate.get(rate.id);
    if (!forThis?.length) return rate;
    const next = { ...rate };
    for (const p of forThis) (next as Record<string, unknown>)[p.field] = p.proposed;
    return next;
  });
}

/** One line summarising what a run would do, for the confirmation step. */
export function summariseProposals(result: TargetResult, spec: TargetSpec): string {
  const { proposals, skipped } = result;
  if (!proposals.length) {
    return `Nothing to change — ${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped.`;
  }
  const cuts = proposals.filter(p => p.change < 0).length;
  const rises = proposals.filter(p => p.change > 0).length;
  const proxies = proposals.filter(p => p.proxy).length;
  const direction = spec.deltaPct < 0 ? "below" : spec.deltaPct > 0 ? "above" : "level with";

  return [
    `${proposals.length} rate${proposals.length === 1 ? "" : "s"} set ${Math.abs(spec.deltaPct)}% ${direction} them`,
    `${cuts} down, ${rises} up`,
    proxies ? `${proxies} using their 3-day rate as a proxy` : null,
    skipped.length ? `${skipped.length} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface SkipTally {
  reason: string;
  count: number;
}

/**
 * Skips counted by reason, for the screen.
 *
 * Listing the rows individually is the wrong shape: repricing one month skips
 * every row of the other eleven, so the list would be hundreds long and its one
 * interesting line — a group this competitor does not sell — would be buried in
 * it.
 *
 * "Outside the chosen months" is forced last however large it is, because it is
 * the operator's own filter doing what they asked. The others are gaps in the
 * data, and sorting purely by count would put the expected one on top and push
 * the surprises below the fold.
 */
export function summariseSkips(skipped: SkippedRow[]): SkipTally[] {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => {
      const aFilter = a.reason === SKIP_REASONS.outsideMonths ? 1 : 0;
      const bFilter = b.reason === SKIP_REASONS.outsideMonths ? 1 : 0;
      // Ties break on the reason so the order is stable across renders rather
      // than inheriting whatever order the rows happened to arrive in.
      return aFilter - bFilter || b.count - a.count || a.reason.localeCompare(b.reason);
    });
}

/** Every month present in the comparison, in calendar order, for the filter. */
export function monthsPresent(rows: ComparisonRow[]): { month: number; name: string }[] {
  const seen = new Map<number, string>();
  for (const r of rows) if (!seen.has(r.month)) seen.set(r.month, r.month_name);
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, name]) => ({ month, name }));
}
