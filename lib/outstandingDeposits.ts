/**
 * Deposits that were asked for and never reconciled.
 *
 * **W24, from the §5.3 audit, and the gap with money on the other side of it.**
 * `lib/wise.ts` constructs a payment URL and `POST /api/admin/wise/deposit-link`
 * returns it. That was the entire feature. §5.3 requires more:
 *
 * > *Wise has no webhook … the failure mode is therefore silence, and the answer
 * > is a reconciliation task that is **visible and ages** — an unreconciled Wise
 * > deposit must appear as outstanding work, not sit unnoticed until someone
 * > checks the bank.*
 *
 * Nothing recorded that a deposit was expected, nothing listed the outstanding
 * ones, and nothing aged them. `deposit_paid_at` has existed since migration 010
 * and **no admin screen referenced it at all** — so, as with the competitor
 * feeds, the measurement was there and no surface asked for it.
 *
 * **This needs no migration, which is why it is worth doing now.** An awaited
 * deposit is derivable from columns that already exist: a live reservation with
 * a positive deposit and no `deposit_paid_at`.
 *
 * **One limitation, stated rather than papered over.** There is no payment-method
 * column on `reservations`, so a *Wise* deposit cannot be told from a Stripe one
 * that failed to confirm. This therefore surfaces **every** unreconciled
 * deposit, which is a superset of what §5.3 asks for and strictly better than
 * nothing — but it is not Wise attribution, and anyone reading a count here
 * should not take it as one. Attribution would need a column and a migration.
 */

/** Only the fields this needs, so the admin's own row type stays the caller's. */
export interface DepositRow {
  id: string;
  status: string;
  deposit?: number | string | null;
  deposit_paid_at?: string | null;
  pickup_date?: string | null;
  created_at?: string | null;
}

/**
 * Statuses where a deposit is still owed.
 *
 * `returned`, `cancelled`, `no_show` and `voided` are excluded: the rental is
 * over or off, so an unpaid deposit there is an accounting question rather than
 * outstanding work, and listing it would bury the ones that still matter.
 *
 * `confirmed` is included deliberately even though confirmation normally follows
 * payment — a confirmed booking with no `deposit_paid_at` is exactly the state a
 * missed reconciliation produces, and excluding it would hide the case this
 * exists to catch.
 */
export const DEPOSIT_OWED_STATUSES = new Set(["pending", "confirmed", "active"]);

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

function parseAmount(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether a deposit is still owed on this reservation.
 *
 * A deposit of zero or none is not outstanding — plenty of rows legitimately
 * carry no deposit, and treating those as work would make the list useless.
 */
export function isDepositOutstanding(row: DepositRow): boolean {
  if (!DEPOSIT_OWED_STATUSES.has(row.status)) return false;
  if (row.deposit_paid_at) return false;
  const amount = parseAmount(row.deposit);
  return amount !== null && amount > 0;
}

/**
 * Whole calendar days since the booking was taken, in the business's timezone.
 *
 * This is the *ageing* §5.3 asks for: the question an operator needs answered is
 * "how long has this been sitting unreconciled", and the answer has to grow by
 * itself rather than being noticed. Null when there is no creation time to count
 * from, which is reported as unknown rather than as zero.
 */
export function waitingDays(
  row: DepositRow,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE
): number | null {
  if (!row.created_at) return null;
  const created = new Date(row.created_at);
  if (Number.isNaN(created.getTime())) return null;
  return Math.max(0, Math.round((calendarDay(now, timeZone) - calendarDay(created, timeZone)) / MS_PER_DAY));
}

/**
 * Calendar days until pick-up; negative once it has passed.
 *
 * Age alone does not rank these. A deposit unpaid for two days on a booking that
 * collects tomorrow is more urgent than one unpaid for three weeks in May.
 */
export function daysToPickup(
  row: DepositRow,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE
): number | null {
  if (!row.pickup_date) return null;
  const pickup = new Date(`${row.pickup_date}T12:00:00Z`);
  if (Number.isNaN(pickup.getTime())) return null;
  return Math.round((calendarDay(pickup, timeZone) - calendarDay(now, timeZone)) / MS_PER_DAY);
}

export type DepositUrgency = "collected" | "imminent" | "waiting";

/**
 * How hard this one needs looking at.
 *
 * - `collected` — the vehicle is out, or pick-up has passed, and the deposit was
 *   never reconciled. Money is at risk now, not later.
 * - `imminent` — collecting within two days.
 * - `waiting` — everything else.
 */
export function depositUrgency(row: DepositRow, now: Date): DepositUrgency {
  if (row.status === "active") return "collected";
  const until = daysToPickup(row, now);
  if (until !== null && until < 0) return "collected";
  if (until !== null && until <= 2) return "imminent";
  return "waiting";
}

/**
 * The sentence shown against the row, or null if nothing is owed.
 *
 * Written for the person reading it: what is unpaid, how long it has been, and
 * why it matters now. It names the bank explicitly because that is where the
 * answer is — §5.3's "not sit unnoticed until someone checks the bank" cuts both
 * ways, and an operator told only "unpaid" does not know what to do next.
 */
export function describeOutstandingDeposit(row: DepositRow, now: Date): string | null {
  if (!isDepositOutstanding(row)) return null;

  const amount = parseAmount(row.deposit) ?? 0;
  const waited = waitingDays(row, now);
  const urgency = depositUrgency(row, now);

  const age =
    waited === null
      ? "for an unknown time"
      : waited === 0
      ? "since today"
      : waited === 1
      ? "for 1 day"
      : `for ${waited} days`;

  const why =
    urgency === "collected"
      ? "The vehicle is out or the pick-up date has passed, so this is money at risk now."
      : urgency === "imminent"
      ? "Pick-up is within two days."
      : "No payment has been matched to it yet.";

  return (
    `Deposit of €${amount.toFixed(2)} is unreconciled ${age}. ${why} ` +
    "Wise does not notify us when money arrives, so this clears only when somebody checks the " +
    "bank and records it on the reservation."
  );
}

export interface DepositSummary {
  count: number;
  /** Euros owed across every outstanding row. */
  total: number;
  /** Longest wait in days, or null if none is datable. */
  oldestDays: number | null;
  /** Rows where the vehicle is out or pick-up has passed. */
  collected: number;
  imminent: number;
}

/**
 * The one line an operator reads before deciding whether to open the bank.
 *
 * Reports the *worst* case alongside the totals, for the same reason
 * `summariseFreshness` reports the oldest source: an average hides the row that
 * matters, and the row that matters here is a vehicle already out with nothing
 * paid.
 */
export function summariseOutstandingDeposits(rows: DepositRow[], now: Date): DepositSummary {
  const owed = rows.filter(isDepositOutstanding);
  const ages = owed.map(r => waitingDays(r, now)).filter((d): d is number => d !== null);

  return {
    count: owed.length,
    total: Math.round(owed.reduce((sum, r) => sum + (parseAmount(r.deposit) ?? 0), 0) * 100) / 100,
    oldestDays: ages.length ? Math.max(...ages) : null,
    collected: owed.filter(r => depositUrgency(r, now) === "collected").length,
    imminent: owed.filter(r => depositUrgency(r, now) === "imminent").length,
  };
}
