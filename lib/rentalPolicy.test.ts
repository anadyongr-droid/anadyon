import { describe, expect, it } from "vitest";
import { ageOnDate, driverAgeBandForDob } from "./rentalPolicy";

describe("driver age derived from date of birth", () => {
  it("uses the age on the rental pick-up date, not today's age", () => {
    expect(ageOnDate("2002-08-24", "2026-08-23")).toBe(23);
    expect(ageOnDate("2002-08-24", "2026-08-24")).toBe(24);
  });

  it("selects each configured bracket at its boundaries", () => {
    expect(driverAgeBandForDob("2005-08-22", "2026-08-22")).toBe("21–25");
    expect(driverAgeBandForDob("2001-08-22", "2026-08-22")).toBe("21–25");
    expect(driverAgeBandForDob("2000-08-22", "2026-08-22")).toBe("26–65");
    expect(driverAgeBandForDob("1961-08-22", "2026-08-22")).toBe("26–65");
    expect(driverAgeBandForDob("1960-08-22", "2026-08-22")).toBe("66+");
  });

  it("does not invent a bracket for under-age or invalid dates", () => {
    expect(driverAgeBandForDob("2006-08-23", "2026-08-22")).toBeNull();
    expect(driverAgeBandForDob("not-a-date", "2026-08-22")).toBeNull();
    expect(driverAgeBandForDob("2000-02-31", "2026-08-22")).toBeNull();
  });
});
