import { describe, it, expect } from "vitest";
import { resolveDailyRate } from "./pricing";

describe("resolveDailyRate", () => {
  it("uses the card rate when nothing was agreed", () => {
    expect(resolveDailyRate(63, "", 3)).toEqual({ rate: 63, overridden: false, difference: 0 });
    expect(resolveDailyRate(63, null, 3)).toEqual({ rate: 63, overridden: false, difference: 0 });
  });

  it("takes the rate agreed at the counter", () => {
    // The case that prompted this: €50/day settled face to face on a €63 card rate.
    const d = resolveDailyRate(63, "50", 3);
    expect(d.rate).toBe(50);
    expect(d.overridden).toBe(true);
    expect(d.difference).toBe(-39);
  });

  it("handles a rate agreed above the card rate", () => {
    const d = resolveDailyRate(50, "60", 2);
    expect(d).toEqual({ rate: 60, overridden: true, difference: 20 });
  });

  it("does not treat a rate equal to the card rate as negotiated", () => {
    // Typing the same number is not a negotiation, and must not light up the UI
    // as though a discount had been given.
    expect(resolveDailyRate(63, "63", 3).overridden).toBe(false);
    expect(resolveDailyRate(63, 63, 3).overridden).toBe(false);
  });

  it("ignores nonsense rather than charging NaN", () => {
    // A half-typed or pasted value must never reach the total. NaN silently
    // became null in the database once already, on the public quote form.
    for (const bad of ["abc", "--", "1.2.3", " "]) {
      const d = resolveDailyRate(63, bad, 3);
      expect(d.rate, `input ${JSON.stringify(bad)}`).toBe(63);
      expect(d.overridden).toBe(false);
    }
  });

  it("refuses a negative rate", () => {
    expect(resolveDailyRate(63, "-10", 3)).toEqual({ rate: 63, overridden: false, difference: 0 });
  });

  it("allows a genuine zero — a free rental is a real decision", () => {
    const d = resolveDailyRate(63, "0", 3);
    expect(d.rate).toBe(0);
    expect(d.overridden).toBe(true);
    expect(d.difference).toBe(-189);
  });
});
