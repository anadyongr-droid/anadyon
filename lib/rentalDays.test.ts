/**
 * The duration badge and the price must be the same number.
 *
 * They were not. DateRangePicker computed its own date-only difference while
 * the price used calcRentalDays, which counts 24-hour periods and rounds any
 * part of one up to a full day. A 20 Aug 09:00 → 29 Aug 18:00 booking was
 * therefore billed as ten days and labelled as nine, directly above the total.
 *
 * Of the two numbers a customer sees, the wrong one was the one that reads
 * like a summary of the other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { calcRentalDays } from "./pricing";

describe("rental day count", () => {
  it("counts the reported booking as ten days, not nine", () => {
    // The case Tasos reported: same dates, later return time.
    expect(calcRentalDays("2026-08-20", "2026-08-29", "09:00", "09:00")).toBe(9);
    expect(calcRentalDays("2026-08-20", "2026-08-29", "09:00", "18:00")).toBe(10);
  });

  it("rounds any part of a 24-hour period up to a whole day", () => {
    // Thirty minutes over is a tenth day. This is the rental convention, and
    // the reason the times cannot be ignored.
    expect(calcRentalDays("2026-08-20", "2026-08-29", "10:00", "10:30")).toBe(10);
    // Returning earlier in the day than pickup does not add one.
    expect(calcRentalDays("2026-08-20", "2026-08-29", "18:00", "09:00")).toBe(9);
  });

  it("never returns zero for a same-day rental", () => {
    expect(calcRentalDays("2026-08-20", "2026-08-20", "09:00", "17:00")).toBe(1);
    expect(calcRentalDays("2026-08-20", "2026-08-20", "09:00", "09:00")).toBe(1);
  });

  it("keeps 24-hour billing boundaries stable across Greek clock changes", () => {
    // Europe/Athens advances on 29 March and falls back on 25 October in 2026.
    // The same displayed time on the next date is one rental day in both cases;
    // one minute beyond that boundary starts a second billable day.
    expect(calcRentalDays("2026-03-28", "2026-03-29", "09:00", "09:00")).toBe(1);
    expect(calcRentalDays("2026-03-28", "2026-03-29", "09:00", "09:01")).toBe(2);
    expect(calcRentalDays("2026-10-24", "2026-10-25", "09:00", "09:00")).toBe(1);
    expect(calcRentalDays("2026-10-24", "2026-10-25", "09:00", "09:01")).toBe(2);
  });

  it("returns the same duration in the browser and on the server", () => {
    const original = process.env.TZ;
    try {
      for (const timezone of ["UTC", "Europe/Athens", "America/New_York", "Asia/Tokyo"]) {
        process.env.TZ = timezone;
        expect(calcRentalDays("2026-10-24", "2026-10-25", "09:00", "09:00")).toBe(1);
        expect(calcRentalDays("2026-10-24", "2026-10-25", "09:00", "09:01")).toBe(2);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("has no second implementation in the date picker", () => {
    // The guard that matters. The bug was not bad arithmetic, it was two
    // implementations of the same rule drifting apart — and the duplicate is
    // easy to reintroduce, because subtracting two dates looks obviously
    // correct until times exist.
    const src = readFileSync(join(__dirname, "../app/components/DateRangePicker.tsx"), "utf8");
    expect(src).toContain("calcRentalDays");
    expect(src).not.toMatch(/86400000/);
  });

  it("is given the times by every screen that renders the badge", () => {
    // Passing the dates but not the times silently falls back to 09:00/09:00,
    // which reproduces the original bug without looking like it.
    for (const file of ["../app/components/BookingForm.tsx", "../app/admin/components/ReservationModal.tsx"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      const call = src.slice(src.indexOf("<DateRangePicker"));
      const props = call.slice(0, call.indexOf("/>"));
      expect(props, `${file} must pass pickupTime`).toContain("pickupTime");
      expect(props, `${file} must pass returnTime`).toContain("returnTime");
    }
  });
});
