import { describe, expect, it } from "vitest";
import { calcPromoDiscount } from "./pricing";
import { MAX_CHILD_SEATS_TOTAL, seatsWithinLimit } from "./rentalPolicy";

describe("promo discount is a formula, not a stored amount", () => {
  const tenPercent = { type: "percentage" as const, value: 10 };

  it("tracks the subtotal as dates, model or extras change", () => {
    // The same code applied once, against three different rentals.
    expect(calcPromoDiscount(tenPercent, 374.2)).toBe(37.42);
    expect(calcPromoDiscount(tenPercent, 500)).toBe(50);
    expect(calcPromoDiscount(tenPercent, 120)).toBe(12);
  });

  it("caps a fixed code at the subtotal so the total never goes negative", () => {
    const fifty = { type: "fixed" as const, value: 50 };
    expect(calcPromoDiscount(fifty, 200)).toBe(50);
    expect(calcPromoDiscount(fifty, 30)).toBe(30);
    expect(calcPromoDiscount(fifty, 50)).toBe(50);
  });

  it("is zero when there is nothing to discount", () => {
    expect(calcPromoDiscount(tenPercent, 0)).toBe(0);
    expect(calcPromoDiscount(null, 100)).toBe(0);
    expect(calcPromoDiscount(undefined, 100)).toBe(0);
    expect(calcPromoDiscount(tenPercent, Number.NaN)).toBe(0);
    expect(calcPromoDiscount({ type: "fixed", value: -20 }, 100)).toBe(0);
  });

  it("rounds to whole cents", () => {
    expect(calcPromoDiscount({ type: "percentage", value: 33.333 }, 100)).toBe(33.33);
  });
});

describe("combined child-seat limit", () => {
  /**
   * Exhaustive rather than a hand-picked list. Spot-checking missed 3+3 — the
   * combination that actually reached production — so every pair from 0 to 5
   * is asserted here and the expectation is derived from the rule itself.
   */
  it("accepts a pair if and only if both are 0..3 and they sum to 3 or less", () => {
    for (let baby = 0; baby <= 5; baby++) {
      for (let child = 0; child <= 5; child++) {
        const shouldFit = baby + child <= MAX_CHILD_SEATS_TOTAL;
        expect(
          seatsWithinLimit(baby, child),
          `${baby} baby + ${child} child should ${shouldFit ? "fit" : "not fit"}`,
        ).toBe(shouldFit);
      }
    }
  });

  it("rejects the specific over-limit pairs the old form could produce", () => {
    // Each dropdown independently offered 0-3, so these were all reachable.
    // 3+3 is the one that reached production as quote 2R55WT.
    for (const [baby, child] of [[2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3]]) {
      expect(seatsWithinLimit(baby, child), `${baby}+${child}`).toBe(false);
    }
  });

  it("rejects forged and non-integer values", () => {
    expect(seatsWithinLimit(4, 0)).toBe(false);
    expect(seatsWithinLimit(0, 4)).toBe(false);
    expect(seatsWithinLimit(-1, 0)).toBe(false);
    expect(seatsWithinLimit(0, -2)).toBe(false);
    expect(seatsWithinLimit(-1, 4)).toBe(false);
    expect(seatsWithinLimit(1.5, 1)).toBe(false);
    expect(seatsWithinLimit(Number.NaN, 0)).toBe(false);
    expect(seatsWithinLimit(Number.POSITIVE_INFINITY, 0)).toBe(false);
  });

  it("states the limit once, so form, API and database cannot disagree", () => {
    expect(MAX_CHILD_SEATS_TOTAL).toBe(3);
  });
});
