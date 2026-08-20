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
import { calcVehicleSubtotal, calcRentalDays, type Rate } from "./pricing";

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
