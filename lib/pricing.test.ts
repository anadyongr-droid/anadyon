/**
 * calcVehicleSegments split a rental into calendar-date segments and counted
 * days by subtracting dates, blind to time of day. calcRentalDays (used for
 * tier selection and for the days shown to the customer) instead counts
 * 24-hour periods and rounds any part of one up — so a 09:00 pickup returned
 * at 10:00 the next day is one calendar date apart but two billable days.
 *
 * The two numbers disagreed and the segment count is the one that reaches
 * the customer's total: a booking billed as N days by calcRentalDays could
 * still be charged for N-1 days by calcVehicleSubtotal. Reported by Tasos as
 * the vehicle subtotal being roughly halved on a 2-day, 25-hour rental.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { calcExtrasLines, calcExtrasTotal, calcVehicleSubtotal, calcRentalDays, type ExtrasConfig, type Rate } from "./pricing";

const RATES: Rate[] = [
  {
    id: "r1",
    pricing_group: "motorbike_a",
    season_name: "All year",
    season_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    rate_1_2: 12.5,
    rate_3_6: 10,
    rate_7plus: 8,
  },
];

describe("calcVehicleSubtotal against calcRentalDays", () => {
  it("charges for both billable days on a 25-hour, 2-day rental", () => {
    // 21 Aug 09:00 -> 22 Aug 10:00: one calendar date apart, two billable days.
    const days = calcRentalDays("2026-08-21", "2026-08-22", "09:00", "10:00");
    expect(days).toBe(2);
    const subtotal = calcVehicleSubtotal(RATES, "motorbike_a", "2026-08-21", "2026-08-22", days);
    expect(subtotal).toBe(2 * 12.5);
  });

  it("charges for one day, not zero, on a same-day rental", () => {
    const days = calcRentalDays("2026-08-20", "2026-08-20", "09:00", "17:00");
    expect(days).toBe(1);
    const subtotal = calcVehicleSubtotal(RATES, "motorbike_a", "2026-08-20", "2026-08-20", days);
    expect(subtotal).toBe(12.5);
  });

  it("matches the plain calendar-day case with no time rounding", () => {
    const days = calcRentalDays("2026-08-20", "2026-08-25", "09:00", "09:00");
    expect(days).toBe(5);
    const subtotal = calcVehicleSubtotal(RATES, "motorbike_a", "2026-08-20", "2026-08-25", days);
    expect(subtotal).toBe(5 * 10);
  });
});

describe("extras itemisation", () => {
  const extras: ExtrasConfig[] = [
    { id: "baby", key: "baby_seat", label: "Baby seat", daily_rate: 3, enabled: true },
    { id: "driver", key: "additional_drivers", label: "Additional driver", daily_rate: 2.5, enabled: true },
    { id: "fdw", key: "fdw", label: "Full damage waiver", daily_rate: 5, enabled: true },
  ];
  const selection = { gps: false, baby_seat: 1, child_seat: 0, fdw: false, additional_drivers: 2 };

  it("returns one auditable line per selected extra", () => {
    expect(calcExtrasLines(extras, selection, 4)).toEqual([
      { key: "baby_seat", label: "Baby seat", quantity: 1, dailyRate: 3, rentalDays: 4, total: 12 },
      { key: "additional_drivers", label: "Additional driver", quantity: 2, dailyRate: 2.5, rentalDays: 4, total: 20 },
    ]);
  });

  it("keeps the stored subtotal equal to the visible lines", () => {
    expect(calcExtrasTotal(extras, selection, 4)).toBe(32);
  });

  it("persists the recalculated total, deposit and balance from the edit form", () => {
    const source = readFileSync(new URL("../app/admin/components/ReservationModal.tsx", import.meta.url), "utf8");
    const payload = source.slice(source.indexOf("const payload = normaliseForStorage"), source.indexOf("const url = isEdit"));
    expect(payload).toContain("extras_subtotal: extrasSubtotal");
    expect(payload).toContain("total,");
    expect(payload).toContain("deposit,");
    expect(payload).toContain("balance_due: balanceDue");
  });
});
