import { INSURANCE_SURCHARGE_KEY, insuranceSurchargeApplies } from "./rentalPolicy";

export type PricingGroup = "car_a" | "car_b" | "car_c" | "motorbike_a" | "motorbike_b" | "bike";

export const DEPOSIT_RATE = 0.3;

export interface Rate {
  id: string;
  pricing_group: PricingGroup;
  season_name: string;
  season_months: number[];
  rate_1_2: number;
  rate_3_6: number;
  rate_7plus: number;
}

export interface ExtrasConfig {
  id: string;
  key: string;
  label: string;
  daily_rate: number;
  enabled: boolean;
}

export interface ExtrasSelection {
  gps: boolean;
  baby_seat: number;
  child_seat: number;
  fdw: boolean;
  additional_drivers: number;
}

export interface ExtraChargeLine {
  key: keyof ExtrasSelection;
  label: string;
  quantity: number;
  dailyRate: number;
  rentalDays: number;
  total: number;
}

export function getDailyRate(
  rates: Rate[],
  pricingGroup: PricingGroup,
  pickupMonth: number, // 1-12
  rentalDays: number
): number {
  const season = rates.find(
    (r) => r.pricing_group === pricingGroup && r.season_months.includes(pickupMonth)
  );
  if (!season) return 0;
  if (rentalDays >= 7) return season.rate_7plus;
  if (rentalDays >= 3) return season.rate_3_6;
  return season.rate_1_2;
}

export interface RateSegment {
  month: number;
  monthName: string;
  days: number;
  rate: number;
  subtotal: number;
}

function segmentTierRate(season: Rate, rentalDays: number): number {
  if (rentalDays >= 7) return season.rate_7plus;
  if (rentalDays >= 3) return season.rate_3_6;
  return season.rate_1_2;
}

function parseDateOnlyUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));

  // Date.UTC normalises impossible dates (for example 31 February), so check
  // every part before accepting the value.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Break a rental into billable-day segments and return the seasonal rate and
 * cost for each segment.
 *
 * The duration tier (1–2, 3–6 or 7+) belongs to the whole rental. The season
 * belongs to the calendar date on which each successive 24-hour billing
 * period starts. Therefore an 09:00 return at the exact boundary adds no new
 * period, while a return one minute later starts a further billable period on
 * the return date and uses that date's season.
 */
export function calcVehicleSegments(
  rates: Rate[],
  pricingGroup: PricingGroup,
  pickupDate: string,
  dropoffDate: string,
  rentalDays: number
): RateSegment[] {
  const start = parseDateOnlyUtc(pickupDate);
  const end = parseDateOnlyUtc(dropoffDate);
  if (!start || !end || !Number.isInteger(rentalDays) || rentalDays < 1) return [];

  const segments: RateSegment[] = [];
  for (let dayIndex = 0; dayIndex < rentalDays; dayIndex++) {
    const billingDate = new Date(start);
    billingDate.setUTCDate(start.getUTCDate() + dayIndex);
    const month = billingDate.getUTCMonth() + 1;
    const season = rates.find(
      (r) => r.pricing_group === pricingGroup && r.season_months.includes(month)
    );
    const rate = season ? segmentTierRate(season, rentalDays) : 0;

    const last = segments.at(-1);
    if (last && last.month === month && last.rate === rate) {
      last.days += 1;
      last.subtotal = parseFloat((last.rate * last.days).toFixed(2));
    } else {
      segments.push({
        month,
        monthName: billingDate.toLocaleString("en-GB", {
          month: "long",
          timeZone: "UTC",
        }),
        days: 1,
        rate,
        subtotal: parseFloat(rate.toFixed(2)),
      });
    }
  }

  return segments;
}

/** Total vehicle cost across all month segments. */
export function calcVehicleSubtotal(
  rates: Rate[],
  pricingGroup: PricingGroup,
  pickupDate: string,
  dropoffDate: string,
  rentalDays: number
): number {
  return parseFloat(
    calcVehicleSegments(rates, pricingGroup, pickupDate, dropoffDate, rentalDays)
      .reduce((sum, s) => sum + s.subtotal, 0)
      .toFixed(2)
  );
}

export function calcExtrasLines(
  extras: ExtrasConfig[],
  selections: ExtrasSelection,
  rentalDays: number
): ExtraChargeLine[] {
  if (!Number.isInteger(rentalDays) || rentalDays < 1) return [];

  const quantities: Array<[keyof ExtrasSelection, number]> = [
    ["gps", selections.gps ? 1 : 0],
    ["baby_seat", selections.baby_seat],
    ["child_seat", selections.child_seat],
    ["fdw", selections.fdw ? 1 : 0],
    ["additional_drivers", selections.additional_drivers],
  ];

  return quantities.flatMap(([key, rawQuantity]) => {
    const quantity = Number(rawQuantity);
    const config = extras.find((extra) => extra.key === key);
    const dailyRate = Number(config?.daily_rate ?? 0);
    if (!config || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(dailyRate)) return [];
    return [{
      key,
      label: config.label,
      quantity,
      dailyRate,
      rentalDays,
      total: parseFloat((quantity * dailyRate * rentalDays).toFixed(2)),
    }];
  });
}

export function calcExtrasTotal(
  extras: ExtrasConfig[],
  selections: ExtrasSelection,
  rentalDays: number
): number {
  return parseFloat(
    calcExtrasLines(extras, selections, rentalDays)
      .reduce((sum, line) => sum + line.total, 0)
      .toFixed(2)
  );
}

/**
 * The young-driver insurance surcharge, priced as its own line.
 *
 * ─── Why this is not an extra ───
 *
 * It is charged per day from a rate row like every other extra, and it appears
 * beside them on the quote, so the obvious move is to add `insurance_surcharge`
 * to `ExtrasSelection` and let `calcExtrasLines` handle it. That would be a
 * hole. `ExtrasSelection` is the customer's own answers — the seats they want,
 * the drivers they are adding — and every quantity in it arrives from the
 * browser. A surcharge the payer can set to zero is not a surcharge.
 *
 * So it is derived here instead, from the driver's age on the pick-up date,
 * which comes from the date of birth they supplied and cannot be asserted
 * separately. The public quote route recomputes the age server-side before
 * calling this; nothing in the request body reaches it.
 *
 * Returns null rather than a zero line when it does not apply, so callers
 * cannot accidentally render "Insurance surcharge €0.00" on a 40-year-old's
 * quote. A missing or disabled rate row also returns null: an operator who
 * switches the row off has switched the charge off, and inventing a default
 * would charge money nobody configured.
 */
export interface InsuranceSurchargeLine {
  key: typeof INSURANCE_SURCHARGE_KEY;
  label: string;
  dailyRate: number;
  rentalDays: number;
  total: number;
}

export function calcInsuranceSurchargeLine(
  extras: ExtrasConfig[],
  ageAtPickup: number | null | undefined,
  rentalDays: number
): InsuranceSurchargeLine | null {
  if (!insuranceSurchargeApplies(ageAtPickup)) return null;
  if (!Number.isInteger(rentalDays) || rentalDays < 1) return null;

  const config = extras.find((extra) => extra.key === INSURANCE_SURCHARGE_KEY);
  // `enabled === false` is the operator turning it off. An absent flag is
  // treated as on, matching how the other extras read their own rows.
  if (!config || config.enabled === false) return null;

  const dailyRate = Number(config.daily_rate);
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) return null;

  return {
    key: INSURANCE_SURCHARGE_KEY,
    label: config.label,
    dailyRate,
    rentalDays,
    total: parseFloat((dailyRate * rentalDays).toFixed(2)),
  };
}

/** The surcharge as a number, for callers that only need to add it to a subtotal. */
export function calcInsuranceSurchargeTotal(
  extras: ExtrasConfig[],
  ageAtPickup: number | null | undefined,
  rentalDays: number
): number {
  return calcInsuranceSurchargeLine(extras, ageAtPickup, rentalDays)?.total ?? 0;
}

/** What a promo code is, rather than what it was once worth. */
export type PromoType = "percentage" | "fixed";

export interface PromoFormula {
  type: PromoType;
  /** Percent for "percentage", euros for "fixed". */
  value: number;
}

/**
 * The deduction a promo produces against a given subtotal.
 *
 * Deliberately a function of the *current* subtotal rather than a stored
 * amount. `/api/promo/validate` used to compute the figure once from a
 * client-supplied total and the form kept it, so a percentage code applied
 * before the customer changed dates, model or extras stayed frozen at its old
 * value — too small when the rental grew, too large when it shrank. Recomputing
 * on every render is what keeps the displayed deduction honest.
 *
 * A fixed code is capped at the subtotal so the total can never go negative,
 * which matches the cap the database applies when it settles the booking.
 */
export function calcPromoDiscount(promo: PromoFormula | null | undefined, subtotal: number): number {
  if (!promo || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
  const value = Number(promo.value);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw = promo.type === "percentage" ? (subtotal * value) / 100 : value;
  return parseFloat(Math.min(Math.max(raw, 0), subtotal).toFixed(2));
}

export function calcRentalDays(
  pickupDate: string,
  returnDate: string,
  pickupTime = "09:00",
  returnTime = "09:00"
): number {
  const wallClockTime = (dateValue: string, timeValue: string): number | null => {
    const date = parseDateOnlyUtc(dateValue);
    const time = /^(\d{2}):(\d{2})$/.exec(timeValue);
    if (!date || !time) return null;

    const hour = Number(time[1]);
    const minute = Number(time[2]);
    if (hour > 23 || minute > 59) return null;

    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      minute
    );
  };

  // Treat the customer's displayed dates and times as a timezone-independent
  // wall clock. Otherwise a browser in Greece and the Vercel server can count
  // different days around daylight-saving changes (09:00 to 09:00 becomes 23
  // or 25 elapsed hours depending on the machine's timezone).
  const pickup = wallClockTime(pickupDate, pickupTime);
  const dropoff = wallClockTime(returnDate, returnTime);
  if (pickup === null || dropoff === null) return 1;

  const diffMs = dropoff - pickup;
  // Any portion of a 24-hour period counts as a full day
  return Math.max(1, Math.ceil(diffMs / 86400000));
}

/**
 * Settles the daily rate for a reservation: what the card says, against what
 * was agreed at the counter.
 *
 * Staff negotiate in euros per day, so that is what they type. Expressing the
 * same deal as a discount total means doing arithmetic in your head while a
 * customer waits, and getting it wrong costs real money in both directions.
 *
 * An empty override means the card rate stands. An override equal to the card
 * rate is not an override — it should not light up the UI as a negotiated price
 * when nothing was negotiated.
 */
export interface RateDecision {
  /** The rate to charge. */
  rate: number;
  /** True only when a different rate was deliberately entered. */
  overridden: boolean;
  /** Total difference across the rental; negative when discounted. */
  difference: number;
}

export interface VehiclePricingDecision extends RateDecision {
  /** The weighted-average card rate stored for reporting purposes. */
  cardRate: number;
  /** The exact subtotal to charge after applying any agreed flat daily rate. */
  subtotal: number;
}

export function resolveDailyRate(
  cardRate: number,
  override: string | number | null | undefined,
  rentalDays: number
): RateDecision {
  const raw = String(override ?? "").trim();
  const parsed = raw === "" ? null : Number(raw);
  const usable = parsed !== null && Number.isFinite(parsed) && parsed >= 0;
  const overridden = usable && parsed !== cardRate;
  const rate = overridden ? (parsed as number) : cardRate;
  return {
    rate,
    overridden,
    difference: parseFloat(((rate - cardRate) * rentalDays).toFixed(2)),
  };
}

/**
 * Resolve an admin-entered flat daily rate against an exact seasonal subtotal.
 *
 * A cross-season rental does not have one card rate, but the reservations table
 * still stores a daily-rate summary. We store its weighted average while
 * preserving the exact segmented subtotal; multiplying the rounded average
 * back out would otherwise introduce a few cents of drift.
 */
export function resolveVehiclePricing(
  cardSubtotal: number,
  override: string | number | null | undefined,
  rentalDays: number
): VehiclePricingDecision {
  const safeSubtotal = Number.isFinite(cardSubtotal)
    ? parseFloat(cardSubtotal.toFixed(2))
    : 0;
  const cardRate = rentalDays > 0
    ? parseFloat((safeSubtotal / rentalDays).toFixed(2))
    : 0;
  const decision = resolveDailyRate(cardRate, override, rentalDays);
  const subtotal = decision.overridden
    ? parseFloat((decision.rate * rentalDays).toFixed(2))
    : safeSubtotal;

  return {
    ...decision,
    cardRate,
    subtotal,
    difference: parseFloat((subtotal - safeSubtotal).toFixed(2)),
  };
}
