import { describe, expect, it } from "vitest";
import {
  calcRentalDays,
  calcVehicleSegments,
  calcVehicleSubtotal,
  type PricingGroup,
  type Rate,
} from "./pricing";

const GROUPS: PricingGroup[] = [
  "bike",
  "car_a",
  "car_b",
  "car_c",
  "motorbike_a",
  "motorbike_b",
];

const AUGUST_SEPTEMBER: Rate[] = [
  ["bike", 9, 7, 7, 9, 7, 7],
  ["car_a", 52, 49.4, 45.6, 32, 22.6, 19],
  ["car_b", 58, 54.6, 50.4, 38, 26, 21.4],
  ["car_c", 58, 54.6, 50.4, 35, 32, 30],
  ["motorbike_a", 25, 23, 22, 18, 17, 14.5],
  ["motorbike_b", 28, 26, 24, 18.5, 17.5, 15],
].flatMap(([group, aug12, aug36, aug7, sep12, sep36, sep7]) => [
  {
    id: `${group}-aug`, pricing_group: group as PricingGroup,
    season_name: "August", season_months: [8],
    rate_1_2: aug12 as number, rate_3_6: aug36 as number, rate_7plus: aug7 as number,
  },
  {
    id: `${group}-sep`, pricing_group: group as PricingGroup,
    season_name: "September", season_months: [9],
    rate_1_2: sep12 as number, rate_3_6: sep36 as number, rate_7plus: sep7 as number,
  },
]);

const monthRates: Rate[] = GROUPS.flatMap((group, groupIndex) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const base = (groupIndex + 1) * 100 + month;
    return {
      id: `${group}-${month}`,
      pricing_group: group,
      season_name: `Month ${month}`,
      season_months: [month],
      rate_1_2: base + 0.01,
      rate_3_6: base + 0.02,
      rate_7plus: base + 0.03,
    };
  })
);

const utcDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number): string => {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const tierRate = (rate: Rate, rentalDays: number): number =>
  rentalDays >= 7 ? rate.rate_7plus : rentalDays >= 3 ? rate.rate_3_6 : rate.rate_1_2;

const referenceSubtotal = (
  rates: Rate[], group: PricingGroup, pickupDate: string, rentalDays: number
): number => {
  let total = 0;
  for (let day = 0; day < rentalDays; day++) {
    const month = utcDate(addDays(pickupDate, day)).getUTCMonth() + 1;
    const rate = rates.find((candidate) =>
      candidate.pricing_group === group && candidate.season_months.includes(month)
    );
    total += rate ? tierRate(rate, rentalDays) : 0;
  }
  return Number(total.toFixed(2));
};

describe("seasonal pricing by billable-day start", () => {
  it("calculates the confirmed €374.20 August-to-September Car B rental", () => {
    const rentalDays = calcRentalDays("2026-08-25", "2026-09-01", "09:00", "09:01");
    expect(rentalDays).toBe(8);
    expect(calcVehicleSegments(AUGUST_SEPTEMBER, "car_b", "2026-08-25", "2026-09-01", rentalDays)).toEqual([
      { month: 8, monthName: "August", days: 7, rate: 50.4, subtotal: 352.8 },
      { month: 9, monthName: "September", days: 1, rate: 21.4, subtotal: 21.4 },
    ]);
    expect(calcVehicleSubtotal(AUGUST_SEPTEMBER, "car_b", "2026-08-25", "2026-09-01", rentalDays)).toBe(374.2);
  });

  it.each([
    ["bike", 56],
    ["car_a", 338.2],
    ["car_b", 374.2],
    ["car_c", 382.8],
    ["motorbike_a", 168.5],
    ["motorbike_b", 183],
  ] as const)("applies both seasons to %s", (group, expected) => {
    expect(calcVehicleSubtotal(AUGUST_SEPTEMBER, group, "2026-08-25", "2026-09-01", 8)).toBe(expected);
  });

  it("keeps the original same-month partial-day fix", () => {
    const rentalDays = calcRentalDays("2026-08-21", "2026-08-23", "09:00", "09:30");
    expect(rentalDays).toBe(3);
    expect(calcVehicleSubtotal(AUGUST_SEPTEMBER, "car_c", "2026-08-21", "2026-08-23", rentalDays)).toBe(163.8);
  });

  it("matches an independent daily reference across every group and calendar boundary", () => {
    const durations = [1, 2, 3, 6, 7, 8, 14, 31, 45];
    for (let dayOfYear = 0; dayOfYear < 365; dayOfYear++) {
      const pickup = addDays("2026-01-01", dayOfYear);
      for (const rentalDays of durations) {
        // A return one minute after the final exact boundary makes the final
        // calendar date the start of the last billable period.
        const dropoff = addDays(pickup, rentalDays - 1);
        for (const group of GROUPS) {
          const segments = calcVehicleSegments(monthRates, group, pickup, dropoff, rentalDays);
          expect(segments.reduce((sum, segment) => sum + segment.days, 0)).toBe(rentalDays);
          expect(calcVehicleSubtotal(monthRates, group, pickup, dropoff, rentalDays)).toBe(
            referenceSubtotal(monthRates, group, pickup, rentalDays)
          );
        }
      }
    }
  // 365 pickup dates × 9 durations × 6 groups. This is intentionally broad
  // enough to catch a future boundary regression and can exceed Vitest's
  // generic five-second single-test default on GitHub's shared runners.
  // Raised from 15s once the PGlite migration suites started competing for the
  // machine: it runs in ~3s alone and ~15s under a full-suite load, so 15 was
  // close enough to the ceiling to fail on timing rather than on behaviour.
  }, 60_000);

  it("does not change seasonal allocation with the browser or server timezone", () => {
    const original = process.env.TZ;
    try {
      for (const timezone of ["UTC", "Europe/Athens", "America/New_York", "Asia/Tokyo"]) {
        process.env.TZ = timezone;
        expect(calcVehicleSubtotal(AUGUST_SEPTEMBER, "car_b", "2026-08-25", "2026-09-01", 8)).toBe(374.2);
      }
    } finally {
      process.env.TZ = original;
    }
  });
});
