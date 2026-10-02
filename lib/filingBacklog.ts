/**
 * Statutory filings that failed, aged and visible rather than found by accident.
 *
 * **W26, from the §5.3 audit.** The submit route writes `dcl_status = "error"`
 * on a validation failure, a network failure and a non-2xx response, and the
 * reservations list shows a red `!` against that row — so a failure *is* visible
 * **if you happen to open that booking.** §5.3 asks for the other half:
 *
 * > *queue for resubmission and surface the backlog*
 *
 * There was no view of everything sitting in `dcl_status = 'error'`, and no
 * aging. A statutory declaration that failed was a badge, not a task.
 *
 * ## Three decisions worth stating
 *
 * **The clock is the pick-up date, not the attempt time.** There is no
 * `dcl_attempted_at` column and this needs no migration to be useful: the
 * Digital Client List declares a rental, so the deadline belongs to the rental,
 * not to when we last tried. A failed filing on a rental that has **already
 * started** is overdue now, whatever time the attempt was made. That also makes
 * the ageing honest when a filing has never been attempted at all.
 *
 * **`submitting` is in the backlog too, and it is the worse case.** A row left
 * at `submitting` is not merely unfiled — `claim_dcl_submission` in
 * `001_baseline.sql` refuses to re-claim anything already `submitting`, so that
 * reservation **can never be retried** and every attempt answers 409. Yesterday's
 * W27 fix stopped new ones being created by a slow socket, but it could not
 * recover rows already in that state, and nothing anywhere showed them. They
 * need a different instruction from an `error` row: the status has to be reset
 * before a retry is even possible.
 *
 * **A timed-out filing is ambiguous, and the wording says so.** From W27: a
 * submission abandoned on its budget writes `error`, but AADE may have accepted
 * it with the answer lost in transit. Resubmitting one that was accepted files a
 * **duplicate** statutory declaration, which is worse than filing late. This
 * module therefore surfaces and ranks; it does not resubmit, and it does not
 * tell anyone to. Whether an unknown filing is retried automatically or only
 * after someone checks the AADE portal changes what staff must do, so it is
 * Tasos's under `DEFINING-STATEMENTS.md` §13.
 */

/** Only the fields this needs, so the admin's own row type stays the caller's. */
export interface FilingRow {
  id: string;
  dcl_status?: string | null;
  pickup_date?: string | null;
  return_date?: string | null;
  customer_name?: string | null;
  status?: string | null;
}

/**
 * The two states that are outstanding work, and they are not the same work.
 *
 * `error` is re-claimable: the submit route can be run again. `submitting` is
 * stuck, because the claim function refuses it — see the module note above.
 */
export const FILING_FAILED = "error";
export const FILING_STUCK = "submitting";

const MS_PER_DAY = 86_400_000;

/** The business's own calendar, as everything customer-facing uses. */
export const BUSINESS_TIME_ZONE = "Europe/Athens";

function calendarDay(d: Date, timeZone: string): number {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-")
    .map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whether this reservation's client-list filing is outstanding. */
export function isFilingOutstanding(row: FilingRow): boolean {
  return row.dcl_status === FILING_FAILED || row.dcl_status === FILING_STUCK;
}

/**
 * Whether a retry is even possible, or the row has to be unstuck first.
 *
 * This is the distinction the screen exists to make. Telling someone to retry a
 * `submitting` row sends them to a button that answers 409 for ever.
 */
export function isRetryable(row: FilingRow): boolean {
  return row.dcl_status === FILING_FAILED;
}

/**
 * Calendar days since the rental began; negative while it is still to come.
 *
 * Null when there is no pick-up date to count from, which is reported as unknown
 * rather than as zero.
 */
export function daysSincePickup(
  row: FilingRow,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): number | null {
  if (!row.pickup_date) return null;
  const pickup = new Date(`${row.pickup_date}T12:00:00Z`);
  if (Number.isNaN(pickup.getTime())) return null;
  return Math.round((calendarDay(now, timeZone) - calendarDay(pickup, timeZone)) / MS_PER_DAY);
}

export type FilingUrgency = "overdue" | "imminent" | "upcoming";

/**
 * How hard this one needs looking at.
 *
 * - `overdue` — the rental has started and the declaration was never filed.
 *   This is the statutory exposure, and it does not improve by itself.
 * - `imminent` — collecting within two days.
 * - `upcoming` — everything else, including a row with no pick-up date, which
 *   cannot be shown to be overdue and is not assumed to be.
 */
export function filingUrgency(row: FilingRow, now: Date): FilingUrgency {
  const since = daysSincePickup(row, now);
  if (since === null) return "upcoming";
  if (since > 0) return "overdue";
  if (since >= -2) return "imminent";
  return "upcoming";
}

/**
 * The sentence shown against the row, or null if nothing is outstanding.
 *
 * Written for the person reading it: what state the filing is in, how long it
 * has been, and **what to do next** — which differs between the two states, and
 * is the reason this is not one message with a status word substituted in.
 */
export function describeFailedFiling(row: FilingRow, now: Date): string | null {
  if (!isFilingOutstanding(row)) return null;

  const since = daysSincePickup(row, now);
  const urgency = filingUrgency(row, now);

  const when =
    since === null
      ? "The rental has no pick-up date recorded"
      : since > 1
      ? `The rental started ${since} days ago`
      : since === 1
      ? "The rental started yesterday"
      : since === 0
      ? "The rental starts today"
      : `The rental starts in ${Math.abs(since)} days`;

  if (row.dcl_status === FILING_STUCK) {
    return (
      `${when} and the client-list filing is stuck mid-submission. ` +
      "A reservation left in this state cannot be retried at all — the claim " +
      "refuses it and every attempt answers 409 — so its status has to be reset " +
      "before the filing can be sent. This is not the same as a failed filing."
    );
  }

  const pressure =
    urgency === "overdue"
      ? "The declaration was due at the start of the rental, so this is a live statutory gap."
      : "It can still be filed before the rental starts.";

  return (
    `${when} and the client-list filing failed. ${pressure} ` +
    "Check AADE's own record before resubmitting: a filing abandoned on a timeout " +
    "is recorded as failed here but may have been accepted there, and filing it " +
    "twice is worse than filing it late."
  );
}

export interface FilingBacklogSummary {
  count: number;
  /** Rows where the rental has already started. */
  overdue: number;
  /** Rows stuck at `submitting`, which cannot be retried without a reset. */
  stuck: number;
  /** Longest time a started rental has gone unfiled, in days, or null. */
  oldestOverdueDays: number | null;
}

/**
 * The one line read before deciding whether to open the AADE portal.
 *
 * Reports the **worst** case alongside the count, for the same reason
 * `summariseOutstandingDeposits` and `summariseFreshness` do: an average hides
 * the row that matters, and the row that matters here is a rental that has been
 * running for a fortnight with no declaration filed.
 */
export function summariseFilingBacklog(rows: FilingRow[], now: Date): FilingBacklogSummary {
  const outstanding = rows.filter(isFilingOutstanding);
  const overdueAges = outstanding
    .filter(r => filingUrgency(r, now) === "overdue")
    .map(r => daysSincePickup(r, now))
    .filter((d): d is number => d !== null);

  return {
    count: outstanding.length,
    overdue: overdueAges.length,
    stuck: outstanding.filter(r => r.dcl_status === FILING_STUCK).length,
    oldestOverdueDays: overdueAges.length ? Math.max(...overdueAges) : null,
  };
}
