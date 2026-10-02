/**
 * Whether to start a new Apify run, wait for the one already going, or ingest
 * a finished one nobody read.
 *
 * **The defect this exists to fix.** Faros and CarRentals both collect through
 * an Apify browser run that outlasts the serverless ceiling, so `POST` starts
 * the run and returns, and the browser's polling `GET` is what fetches the
 * dataset. Close the tab and the run still finishes — on Apify's servers, with
 * nothing ever reading it. The record sits in `system_settings` as
 * `ingested: false` and no code path picked it up again. Worse, `POST` did not
 * look for a finished-but-uningested run, so pressing the button again started
 * a *new* one; CarRentals runs through residential proxies billed by traffic,
 * so the abandoned run was paid for twice.
 *
 * That is why Faros and CarRentals sat at 16 August while EzCar refreshed: EzCar
 * writes a cursor every batch and resumes, so leaving its page is a delay. This
 * makes the other two behave the same way.
 *
 * Pure on purpose — the routes are thin wrappers around it, and every rule
 * below is a branch that would otherwise only be reachable by paying Apify.
 */

export interface StoredRun {
  runId?: string;
  startedAt?: string;
  ingested?: boolean;
}

/** What Apify says about the stored run, or null if it could not be asked. */
export interface LiveRun {
  status: string;
  /** Apify's `finishedAt`; absent on a run still going. */
  finishedAt?: string | null;
}

export type RunAction = "start" | "wait" | "ingest";

export interface RecoveryDecision {
  action: RunAction;
  /** Said on screen, so the operator knows why the button did what it did. */
  reason: string;
  /**
   * When the recovered data was actually collected, for the import log.
   *
   * Null unless the action is `ingest`. Dating a recovered dataset by the
   * moment it was ingested would report this morning's press as this morning's
   * prices when the run finished last night — the same overstatement the import
   * log was introduced to remove.
   */
  collectedAt: Date | null;
}

/**
 * How old a finished run may be and still be worth ingesting.
 *
 * Twenty-four hours is a judgement, not a measurement, and it balances two real
 * costs. Below it, ingesting saves a run that has already been paid for and the
 * prices still describe roughly today's market. Above it, the market has moved,
 * the searched pickup dates are sliding out of the window that was planned, and
 * an unnamed Apify dataset is heading for expiry anyway — so paying again buys
 * something better than what recovery would return.
 */
export const RECOVERABLE_WITHIN_MS = 24 * 60 * 60 * 1000;

/** Apify statuses that mean the run has not finished yet. */
const IN_FLIGHT = new Set(["READY", "RUNNING"]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function decideRunRecovery(
  stored: StoredRun | null,
  live: LiveRun | null,
  now: Date
): RecoveryDecision {
  if (!stored?.runId) {
    return { action: "start", reason: "no previous run to recover", collectedAt: null };
  }
  if (stored.ingested) {
    return { action: "start", reason: "the last run was already collected", collectedAt: null };
  }
  if (!live) {
    // Apify could not be asked. Starting is the option that can still produce
    // prices: refusing would leave the operator with a button that does nothing
    // and no way to find out why.
    return {
      action: "start",
      reason: "could not read the previous run's status",
      collectedAt: null,
    };
  }
  if (IN_FLIGHT.has(live.status)) {
    // Starting a second run here is the expensive mistake: the first one is
    // still going and will still finish.
    return { action: "wait", reason: "a run is already going", collectedAt: null };
  }
  if (live.status !== "SUCCEEDED") {
    return {
      action: "start",
      reason: `the previous run ended ${live.status.toLowerCase()}`,
      collectedAt: null,
    };
  }

  // Fall back to when it started if Apify gave no finish time: a run cannot have
  // finished before it began, so this can only overstate the age, and erring
  // towards "too old" costs a re-run rather than stale prices.
  const collectedAt = parseDate(live.finishedAt) ?? parseDate(stored.startedAt);
  if (!collectedAt) {
    return {
      action: "start",
      reason: "the previous run has no usable timestamp",
      collectedAt: null,
    };
  }

  const age = now.getTime() - collectedAt.getTime();
  if (age > RECOVERABLE_WITHIN_MS) {
    return {
      action: "start",
      reason: "the finished run is more than a day old",
      collectedAt: null,
    };
  }

  return {
    action: "ingest",
    reason: "collecting the results of the run that was left unread",
    collectedAt,
  };
}

export type PlanAction = "start" | "resume";

export interface PlanDecision {
  action: PlanAction;
  reason: string;
  /** Searches already finished, so the caller can say what is being resumed. */
  finished: number;
  total: number;
}

/**
 * The same question for CarRentals, whose pass is nine searches rather than one.
 *
 * A half-finished plan is resumed rather than replanned: the finished slots hold
 * their prices already and re-running them pays twice for the same traffic. The
 * polling `GET` still drives it — this only stops `POST` from throwing the plan
 * away and starting again.
 */
export function decidePlanRecovery(
  plannedAt: string | null | undefined,
  slots: { done?: boolean }[] | null,
  now: Date
): PlanDecision {
  const total = slots?.length ?? 0;
  const finished = slots?.filter(s => s.done).length ?? 0;

  if (!slots?.length) {
    return { action: "start", reason: "no plan to resume", finished, total };
  }
  if (finished >= total) {
    return { action: "start", reason: "the last pass finished", finished, total };
  }

  const planned = parseDate(plannedAt);
  if (!planned) {
    // State written before this field existed. Treated as stale rather than
    // guessed at: resuming a plan of unknown age could ingest searches for
    // pickup dates that have already passed.
    return { action: "start", reason: "the unfinished plan has no start time", finished, total };
  }
  if (now.getTime() - planned.getTime() > RECOVERABLE_WITHIN_MS) {
    return { action: "start", reason: "the unfinished plan is more than a day old", finished, total };
  }

  return {
    action: "resume",
    reason: "picking up the pass that was left unfinished",
    finished,
    total,
  };
}

/**
 * The oldest collection time across a finished multi-search pass.
 *
 * CarRentals' nine searches do not all run at once, and a resumed pass can mix
 * this morning's searches with yesterday evening's. The comparison screen shows
 * them in one grid, so its date has to describe the whole set — and the honest
 * answer for a set is its oldest member, for the same reason
 * `summariseFreshness` reports the oldest source rather than the newest.
 *
 * Null when nothing carries a timestamp, which leaves the caller to fall back
 * rather than inventing one.
 */
export function oldestCollection(slots: { collectedAt?: string | null }[]): Date | null {
  const times = slots
    .map(s => parseDate(s.collectedAt))
    .filter((d): d is Date => d !== null)
    .map(d => d.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
