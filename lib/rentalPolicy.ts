/**
 * Rental policy statements that appear in more than one place.
 *
 * The driver-age rule was written out three times — the terms page, the terms
 * modal accepted at booking, and the FAQ — and the FAQ had drifted to offering
 * 18 for motorbikes and bikes while both contract texts said 21 for everything.
 * A customer ticking the terms box was accepting one rule while the FAQ
 * promised another, which is the kind of contradiction that turns into a refused
 * rental at the desk.
 *
 * Declared once here and imported everywhere, so the next edit cannot leave two
 * versions in the wild.
 */

export const MIN_DRIVER_AGE = 21;

/**
 * The booking band the youngest drivers fall into.
 *
 * No longer used in the published age copy: the insurance surcharge starts
 * below 23, which is inside this band rather than equal to it, so the wording
 * quotes `INSURANCE_SURCHARGE_AGES` instead. Kept because the band is still
 * what the form offers and what `quotes.driver_age` stores.
 */
export const YOUNG_DRIVER_BAND = "21–25";

/**
 * The age bands the public booking form offers.
 *
 * A band, not a number: nobody types their exact age into a rental form, and
 * `quotes.driver_age` is a text column because a band is what it holds. The
 * quote route validated it as `z.coerce.number()`, so every real submission
 * arrived as NaN and was rejected — while the tests passed, because they sent a
 * number the form never produces.
 *
 * Shared between the form and the schema so the two cannot disagree again.
 * Note the en dash: these must match byte for byte.
 */
export const DRIVER_AGE_BANDS = ["21–25", "26–65", "66+"] as const;
export type DriverAgeBand = (typeof DRIVER_AGE_BANDS)[number];

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

/** Completed years of age on the pick-up date, independent of browser timezone. */
export function ageOnDate(dob: string, referenceDate: string): number | null {
  const birth = dateParts(dob);
  const reference = dateParts(referenceDate);
  if (!birth || !reference) return null;

  let age = reference.year - birth.year;
  if (
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day)
  ) age -= 1;
  return age >= 0 ? age : null;
}

/** The booking band implied by DOB on the actual rental start date. */
export function driverAgeBandForDob(dob: string, pickupDate: string): DriverAgeBand | null {
  const age = ageOnDate(dob, pickupDate);
  if (age === null || age < MIN_DRIVER_AGE) return null;
  if (age <= 25) return "21–25";
  if (age <= 65) return "26–65";
  return "66+";
}

/**
 * The insurance surcharge for young drivers.
 *
 * Our insurer loads the premium for the youngest drivers, so the rental carries
 * a daily surcharge below this age. Requested by Tasos on 2 September 2026 at
 * €5 per day for everyone under 23; see docs/DRIVER-AGE-MARKET.md §4 for what
 * the rest of the market charges (€8–€30/day, so this is at the gentle end).
 *
 * Deliberately *not* expressed through `YOUNG_DRIVER_BAND`. The bands are the
 * dropdown the customer picks from and a text column on `quotes` and
 * `reservations`; the surcharge boundary is an underwriting fact that falls in
 * the middle of the `21–25` band. Tying the two together would mean a schema
 * migration every time the insurer moved the line.
 */
export const INSURANCE_SURCHARGE_BELOW_AGE = 23;

/** The `extras_config.key` the daily amount is read from. */
export const INSURANCE_SURCHARGE_KEY = "insurance_surcharge";

/** The ages that actually pay it, for published copy. Derived, never typed twice. */
export const INSURANCE_SURCHARGE_AGES =
  `${MIN_DRIVER_AGE}–${INSURANCE_SURCHARGE_BELOW_AGE - 1}`;

/**
 * Whether the surcharge applies to a driver of this age on the pick-up date.
 *
 * A null age means we could not work one out — no date of birth was supplied,
 * or it was unparseable. That resolves to *no surcharge*, on the grounds that
 * charging a fee we cannot justify from a stated fact is worse than missing
 * one: the counter verifies age against the licence before the keys move, and
 * an undercharge found there can still be collected. The reverse — an
 * unexplained €5 a day on a 40-year-old's quote — cannot be undone.
 */
export function insuranceSurchargeApplies(ageAtPickup: number | null | undefined): boolean {
  return typeof ageAtPickup === "number"
    && Number.isFinite(ageAtPickup)
    && ageAtPickup >= 0
    && ageAtPickup < INSURANCE_SURCHARGE_BELOW_AGE;
}

/** The same question asked from a date of birth, for callers that hold one. */
export function insuranceSurchargeAppliesForDob(
  dob: string | null | undefined,
  pickupDate: string | null | undefined,
): boolean {
  if (!dob || !pickupDate) return false;
  return insuranceSurchargeApplies(ageOnDate(dob, pickupDate));
}

/**
 * Baby seats and child seats occupy the same back seat, so the limit applies to
 * the two together rather than to each. Enforced in the public form, the public
 * API, both admin reservation routes and finally as a check constraint on
 * `quotes` and `reservations`. A quantity is never silently reduced — a customer
 * who asked for four seats needs to be told we cannot fit four.
 */
export const MAX_CHILD_SEATS_TOTAL = 3;

/** True when a baby/child seat combination is one that can actually be fitted. */
export function seatsWithinLimit(babySeat: number, childSeat: number): boolean {
  return (
    [babySeat, childSeat].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= MAX_CHILD_SEATS_TOTAL,
    ) && babySeat + childSeat <= MAX_CHILD_SEATS_TOTAL
  );
}

/** The one message shown wherever the combined seat limit is breached. */
export const SEATS_LIMIT_MESSAGE =
  `A maximum of ${MAX_CHILD_SEATS_TOTAL} child seats in total (baby and child seats combined) can be fitted to one vehicle.`;

/**
 * The single approved sentence. Used verbatim in the terms, the booking modal
 * and the FAQ.
 *
 * It names the ages but deliberately not the euro amount. The amount is a rate
 * row the office edits from the Rates screen, so a figure typed into the terms
 * page would go stale the first time it changed — silently, and in the one
 * document a customer could hold us to. The exact amount instead appears as its
 * own priced line on the quote and in the confirmation email, before anyone
 * pays anything.
 */
export const DRIVER_AGE_POLICY =
  `Minimum driver's age is ${MIN_DRIVER_AGE} years. Drivers aged ${INSURANCE_SURCHARGE_AGES} pay a daily insurance surcharge, shown in full on your quote before you book.`;

/** The same rule in Greek, for the Greek terms page. */
export const DRIVER_AGE_POLICY_EL =
  `Το ελάχιστο όριο ηλικίας οδηγού είναι ${MIN_DRIVER_AGE} ετών. Οι οδηγοί ηλικίας ${INSURANCE_SURCHARGE_AGES} επιβαρύνονται με ημερήσια ασφαλιστική επιβάρυνση, η οποία εμφανίζεται αναλυτικά στην προσφορά σας πριν από την κράτηση.`;

/** FAQ phrasing — same rule, answered as a question. */
export const DRIVER_AGE_FAQ =
  `Minimum driver's age is ${MIN_DRIVER_AGE} years for all our vehicles. Drivers aged ${INSURANCE_SURCHARGE_AGES} pay a daily insurance surcharge, because our insurer charges more to cover them. The exact amount is shown on your quote before you book.`;

/** Greek rendering of the same rule. Kept beside it so the two cannot diverge. */
export const DRIVER_AGE_FAQ_EL =
  `Το ελάχιστο όριο ηλικίας οδηγού είναι ${MIN_DRIVER_AGE} ετών για όλα τα οχήματά μας. Οι οδηγοί ηλικίας ${INSURANCE_SURCHARGE_AGES} επιβαρύνονται με ημερήσια ασφαλιστική επιβάρυνση, καθώς η ασφαλιστική μας εταιρεία χρεώνει επιπλέον για την κάλυψή τους. Το ακριβές ποσό εμφανίζεται στην προσφορά σας πριν από την κράτηση.`;
