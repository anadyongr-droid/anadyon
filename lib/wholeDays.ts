/**
 * Whole days between an ISO calendar date and a moment.
 *
 * Lifted out of lib/vehicleBlocks.ts unchanged, so that anything asking "how
 * long has this been open" gets the same answer. It counts in UTC: an ISO date
 * has no timezone, and pinning both ends to UTC midnight means the count does
 * not shift depending on the hour the question is asked.
 *
 * Note for whoever unifies these: lib/fleetStatus.ts has its own `daysBetween`
 * that floors to *local* midnight instead. The two agree in Greece for most of
 * the day and disagree near it. That divergence predates this file and is left
 * alone deliberately — reconciling them changes when statutory warnings appear,
 * which is a decision, not a tidy-up.
 */
export function wholeDays(from: string, to: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((end - start.getTime()) / 86_400_000);
}
