export type PricingGroup = "car_a" | "car_b" | "motorbike_a" | "motorbike_b" | "bike";

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

export interface ExtraLineItem {
  key: string;
  label: string;
  qty: number;
  rate: number;
  amount: number;
}

const EXTRA_LABELS: Record<string, string> = {
  gps: "GPS Navigation",
  baby_seat: "Baby Seat (0–9 months)",
  child_seat: "Child Seat (9+ months)",
  fdw: "Full Damage Waiver (FDW)",
  additional_drivers: "Additional Driver",
};

export function buildExtrasLineItems(
  extras: ExtrasConfig[],
  selections: {
    gps: boolean;
    baby_seat: number;
    child_seat: number;
    fdw: boolean;
    additional_drivers: number;
  },
  rentalDays: number
): ExtraLineItem[] {
  const rate = (key: string) => extras.find((e) => e.key === key)?.daily_rate ?? 0;
  const line = (key: string, qty: number): ExtraLineItem => {
    const r = rate(key);
    return { key, label: EXTRA_LABELS[key] ?? key, qty, rate: r, amount: parseFloat((r * qty * rentalDays).toFixed(2)) };
  };

  const items: ExtraLineItem[] = [];
  if (selections.gps) items.push(line("gps", 1));
  if (selections.fdw) items.push(line("fdw", 1));
  if (selections.baby_seat > 0) items.push(line("baby_seat", selections.baby_seat));
  if (selections.child_seat > 0) items.push(line("child_seat", selections.child_seat));
  if (selections.additional_drivers > 0) items.push(line("additional_drivers", selections.additional_drivers));
  return items;
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
