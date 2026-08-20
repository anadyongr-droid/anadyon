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

/** Break a rental into month segments and return the rate and cost for each. */
export function calcVehicleSegments(
  rates: Rate[],
  pricingGroup: PricingGroup,
  pickupDate: string,
  dropoffDate: string,
  rentalDays: number
): RateSegment[] {
  const start = new Date(pickupDate + "T00:00:00");
  const end = new Date(dropoffDate + "T00:00:00");
  const segments: RateSegment[] = [];
  let current = new Date(start);
  while (current < end) {
    const month = current.getMonth() + 1;
    const year = current.getFullYear();
    const nextMonth = new Date(year, current.getMonth() + 1, 1);
    const segEnd = nextMonth < end ? nextMonth : end;
    const segDays = Math.round((segEnd.getTime() - current.getTime()) / 86400000);
    const season = rates.find(
      (r) => r.pricing_group === pricingGroup && r.season_months.includes(month)
    );
    const rate = season ? segmentTierRate(season, rentalDays) : 0;
    segments.push({
      month,
      monthName: new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long" }),
      days: segDays,
      rate,
      subtotal: parseFloat((rate * segDays).toFixed(2)),
    });
    current = segEnd;
  }

  // The walk above counts whole calendar dates and knows nothing of time of
  // day, so it undercounts whenever rentalDays — the number actually billed —
  // exceeds that date-only span: a same-day rental (start === end) produces
  // no segments at all, and a later return time can round a date gap of N up
  // to N+1 billable days (a 09:00 pickup returned at 10:00 the next day is
  // one calendar day apart but two billable days). Charge the gap to the
  // segment covering the return date, since the return time is what created
  // it.
  const countedDays = segments.reduce((sum, s) => sum + s.days, 0);
  const shortfall = rentalDays - countedDays;
  if (shortfall > 0) {
    if (segments.length === 0) {
      const month = start.getMonth() + 1;
      const year = start.getFullYear();
      const season = rates.find(
        (r) => r.pricing_group === pricingGroup && r.season_months.includes(month)
      );
      const rate = season ? segmentTierRate(season, rentalDays) : 0;
      segments.push({
        month,
        monthName: new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long" }),
        days: shortfall,
        rate,
        subtotal: parseFloat((rate * shortfall).toFixed(2)),
      });
    } else {
      const last = segments[segments.length - 1];
      last.days += shortfall;
      last.subtotal = parseFloat((last.rate * last.days).toFixed(2));
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

export function calcExtrasTotal(
  extras: ExtrasConfig[],
  selections: {
    gps: boolean;
    baby_seat: number;
    child_seat: number;
    fdw: boolean;
    additional_drivers: number;
  },
  rentalDays: number
): number {
  const rate = (key: string) => extras.find((e) => e.key === key)?.daily_rate ?? 0;
  let daily = 0;
  if (selections.gps) daily += rate("gps");
  if (selections.fdw) daily += rate("fdw");
  daily += selections.baby_seat * rate("baby_seat");
  daily += selections.child_seat * rate("child_seat");
  daily += selections.additional_drivers * rate("additional_drivers");
  return parseFloat((daily * rentalDays).toFixed(2));
}

export function calcRentalDays(
  pickupDate: string,
  returnDate: string,
  pickupTime = "09:00",
  returnTime = "09:00"
): number {
  const d1 = new Date(`${pickupDate}T${pickupTime}`);
  const d2 = new Date(`${returnDate}T${returnTime}`);
  const diffMs = d2.getTime() - d1.getTime();
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
