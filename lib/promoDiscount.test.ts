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
  it("accepts every combination that fits", () => {
    for (const [baby, child] of [[0, 0], [0, 3], [1, 2], [2, 1], [3, 0]]) {
      expect(seatsWithinLimit(baby, child)).toBe(true);
    }
  });

  it("rejects combinations over the limit, and forged values", () => {
    for (const [baby, child] of [[2, 2], [3, 1], [1, 3], [4, 0], [0, 4]]) {
      expect(seatsWithinLimit(baby, child)).toBe(false);
    }
    expect(seatsWithinLimit(-1, 0)).toBe(false);
    expect(seatsWithinLimit(0, -2)).toBe(false);
    expect(seatsWithinLimit(1.5, 1)).toBe(false);
    expect(seatsWithinLimit(Number.NaN, 0)).toBe(false);
  });

  it("states the limit once, so form, API and database cannot disagree", () => {
    expect(MAX_CHILD_SEATS_TOTAL).toBe(3);
  });
});
