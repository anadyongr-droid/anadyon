import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A promo discount the customer cannot see.
 *
 * The database settles the deduction and stores it on the quote, but the public
 * lookup never selected `discount_amount`, so "View your quote" listed the
 * vehicle and extras and then a total that was lower than their sum — with
 * nothing accounting for the difference. The money was right; the page simply
 * did not mention it, which reads as an error rather than a discount.
 *
 * These assert against source because the page needs a live quote and a
 * browser to render, and a test that cannot run is worse than one that reads
 * what the code commits to.
 */
const route = readFileSync(new URL("../app/api/quote/[ref]/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/quote/[ref]/page.tsx", import.meta.url), "utf8");

describe("promo discount is visible on the public quote", () => {
  it("returns the settled discount and the code that produced it", () => {
    const columns = route.match(/const QUOTE_COLUMNS = "([^"]+)"/)?.[1] ?? "";
    expect(columns, "QUOTE_COLUMNS not found").not.toBe("");
    expect(columns.split(",").map((c) => c.trim())).toEqual(
      expect.arrayContaining(["discount_amount", "promo_code"]),
    );
  });

  it("renders the deduction only when there is one", () => {
    // Guarded, so a quote with no promo does not show a €0.00 discount line.
    expect(page).toMatch(/Number\(quote\.discount_amount\)\s*>\s*0/);
    expect(page).toContain("quote.discount_amount).toFixed(2)");
  });

  it("shows it as a deduction, not another charge", () => {
    expect(page).toMatch(/−€\{Number\(quote\.discount_amount\)/);
  });

  it("keeps the stored figure rather than recomputing it in the browser", () => {
    // The database owns settlement. A page that recalculated the deduction
    // could disagree with the total beside it, and with the email already sent.
    const discountBlock = page.match(/Number\(quote\.discount_amount\)[\s\S]{0,400}?<\/div>/)?.[0] ?? "";
    expect(discountBlock).not.toMatch(/vehicle_subtotal|extras_subtotal|\*\s*0?\.\d/);
  });
});
