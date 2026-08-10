export type PricingGroup = "car_a" | "car_b" | "motorbike_a" | "motorbike_b" | "bike";

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

export function calcRentalDays(pickupDate: string, returnDate: string): number {
  const d1 = new Date(pickupDate);
  const d2 = new Date(returnDate);
  return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
}
