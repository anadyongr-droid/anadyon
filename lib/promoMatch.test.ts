import { expect, it } from "vitest";
import { escapeLikePattern, isExactPromoMatch } from "./promoMatch";
it("escapes all LIKE metacharacters", () => {
  expect(escapeLikePattern("A_B%C\\")).toBe("A\\_B\\%C\\\\");
});
it.each([
  ["SUMMER", "summer", true], ["SUMMER", "______", false],
  ["SUMMER1", "SUMMER_", false], ["VIP_10", "vip_10", true],
  ["VIPX10", "VIP_10", false], [" SUMMER ", " summer ", true],
])("compares %s and %s exactly", (stored, entered, matches) => {
  expect(isExactPromoMatch(stored as string, entered as string)).toBe(matches);
});
