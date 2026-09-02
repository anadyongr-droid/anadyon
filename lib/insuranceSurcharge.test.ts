import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calcInsuranceSurchargeLine, calcInsuranceSurchargeTotal, type ExtrasConfig } from "./pricing";
import {
  INSURANCE_SURCHARGE_AGES,
  INSURANCE_SURCHARGE_BELOW_AGE,
  INSURANCE_SURCHARGE_KEY,
  MIN_DRIVER_AGE,
  DRIVER_AGE_FAQ,
  DRIVER_AGE_FAQ_EL,
  DRIVER_AGE_POLICY,
  DRIVER_AGE_POLICY_EL,
  insuranceSurchargeApplies,
  insuranceSurchargeAppliesForDob,
} from "./rentalPolicy";

/**
 * The under-23 insurance surcharge.
 *
 * Requested at €5 per day for every driver below 23. The rate itself lives in
 * `extras_config` so the office can change it, which means these tests must
 * never assert the number 5 — they assert that whatever the row says is what
 * gets charged, per day, to exactly the right people.
 */

const RATE: ExtrasConfig = {
  id: "surcharge-row",
  key: INSURANCE_SURCHARGE_KEY,
  label: "Insurance surcharge (drivers under 23)",
  daily_rate: 5,
  enabled: true,
};

const OTHER_EXTRAS: ExtrasConfig[] = [
  { id: "a", key: "fdw", label: "Full damage waiver", daily_rate: 12, enabled: true },
  { id: "b", key: "baby_seat", label: "Baby seat", daily_rate: 4, enabled: true },
];

const ALL = [...OTHER_EXTRAS, RATE];

describe("who the surcharge applies to", () => {
  it("charges the ages the published copy names, and nobody else", () => {
    // The boundary is the whole feature. Walk across it rather than sampling.
    expect(insuranceSurchargeApplies(20)).toBe(true);
    expect(insuranceSurchargeApplies(21)).toBe(true);
    expect(insuranceSurchargeApplies(22)).toBe(true);
    expect(insuranceSurchargeApplies(23)).toBe(false);
    expect(insuranceSurchargeApplies(24)).toBe(false);
    expect(insuranceSurchargeApplies(70)).toBe(false);
  });

  it("does not charge a driver whose age we could not establish", () => {
    // No date of birth is not evidence of youth. Charging here would put an
    // unexplained fee on a quote we cannot justify to the customer.
    expect(insuranceSurchargeApplies(null)).toBe(false);
    expect(insuranceSurchargeApplies(undefined)).toBe(false);
    expect(insuranceSurchargeApplies(Number.NaN)).toBe(false);
    expect(insuranceSurchargeAppliesForDob("", "2026-07-01")).toBe(false);
    expect(insuranceSurchargeAppliesForDob("not-a-date", "2026-07-01")).toBe(false);
    expect(insuranceSurchargeAppliesForDob("2004-07-01", "")).toBe(false);
  });

  it("decides on the pick-up date, not on today", () => {
    // A customer who turns 23 between booking and collection is 23 when they
    // take the keys, and the insurer prices the rental, not the enquiry.
    expect(insuranceSurchargeAppliesForDob("2003-07-15", "2026-07-14")).toBe(true);
    expect(insuranceSurchargeAppliesForDob("2003-07-15", "2026-07-15")).toBe(false);
  });
});

describe("what it costs", () => {
  it("charges the row's rate once per rental day", () => {
    const line = calcInsuranceSurchargeLine(ALL, 21, 6);
    expect(line).not.toBeNull();
    expect(line!.dailyRate).toBe(5);
    expect(line!.rentalDays).toBe(6);
    expect(line!.total).toBe(30);
  });

  it("follows the row when the office changes the rate", () => {
    const dearer = [...OTHER_EXTRAS, { ...RATE, daily_rate: 7.5 }];
    expect(calcInsuranceSurchargeTotal(dearer, 22, 4)).toBe(30);
  });

  it("is not charged to anyone at or above the threshold", () => {
    expect(calcInsuranceSurchargeLine(ALL, 23, 6)).toBeNull();
    expect(calcInsuranceSurchargeTotal(ALL, 23, 6)).toBe(0);
  });

  it("returns null rather than a zero line, so nothing renders €0.00", () => {
    // A rendered "Insurance surcharge €0.00" on a 40-year-old's quote is a
    // support call, not a cosmetic problem.
    expect(calcInsuranceSurchargeLine(ALL, 40, 3)).toBeNull();
  });

  it("charges nothing when the operator has switched the row off", () => {
    const off = [...OTHER_EXTRAS, { ...RATE, enabled: false }];
    expect(calcInsuranceSurchargeLine(off, 21, 5)).toBeNull();
  });

  it("charges nothing when no rate row exists at all", () => {
    // Before migration 044 runs, the row is absent. A missing row must mean no
    // charge — never a hardcoded fallback that bills money nobody configured.
    expect(calcInsuranceSurchargeLine(OTHER_EXTRAS, 21, 5)).toBeNull();
  });

  it("refuses a nonsensical rental length instead of pricing it", () => {
    expect(calcInsuranceSurchargeLine(ALL, 21, 0)).toBeNull();
    expect(calcInsuranceSurchargeLine(ALL, 21, -3)).toBeNull();
    expect(calcInsuranceSurchargeLine(ALL, 21, 2.5)).toBeNull();
  });

  it("rounds to whole cents rather than carrying float noise into the total", () => {
    // 5.1 * 3 is 15.299999999999999 in binary floating point. Unrounded, that
    // reaches the stored total and the confirmation email.
    const odd = [...OTHER_EXTRAS, { ...RATE, daily_rate: 5.1 }];
    expect(5.1 * 3).not.toBe(15.3);
    expect(calcInsuranceSurchargeTotal(odd, 21, 3)).toBe(15.3);
  });
});

describe("the surcharge cannot be chosen away", () => {
  it("is absent from the selection type the customer's request populates", () => {
    // The guarantee is structural: `calcExtrasLines` maps `ExtrasSelection`,
    // every field of which arrives from the browser. If the surcharge key ever
    // appears in that map, a crafted request can send a quantity of zero.
    const source = readFileSync(join(process.cwd(), "lib/pricing.ts"), "utf8");
    const selection = /export interface ExtrasSelection \{([\s\S]*?)\}/.exec(source);
    expect(selection, "ExtrasSelection has been renamed — this guard is now blind").not.toBeNull();
    expect(selection![1]).not.toContain(INSURANCE_SURCHARGE_KEY);
  });
});

describe("the published copy matches what is charged", () => {
  it("names the ages that are actually billed", () => {
    expect(INSURANCE_SURCHARGE_AGES).toBe(
      `${MIN_DRIVER_AGE}–${INSURANCE_SURCHARGE_BELOW_AGE - 1}`,
    );
    for (const copy of [DRIVER_AGE_POLICY, DRIVER_AGE_POLICY_EL, DRIVER_AGE_FAQ, DRIVER_AGE_FAQ_EL]) {
      expect(copy).toContain(INSURANCE_SURCHARGE_AGES);
    }
  });

  it("no longer tells the customer the surcharge only 'may' apply", () => {
    // It is now certain and automatic. Leaving the old hedge in place would
    // have been a term we routinely contradict on the invoice.
    expect(DRIVER_AGE_POLICY).not.toContain("may apply");
    expect(DRIVER_AGE_FAQ).not.toContain("may apply");
    expect(DRIVER_AGE_POLICY_EL).not.toContain("ενδέχεται");
    expect(DRIVER_AGE_FAQ_EL).not.toContain("Ενδέχεται");
  });

  it("does not name a euro amount that the Rates screen could silently change", () => {
    for (const copy of [DRIVER_AGE_POLICY, DRIVER_AGE_POLICY_EL, DRIVER_AGE_FAQ, DRIVER_AGE_FAQ_EL]) {
      expect(copy).not.toMatch(/€\s*\d/);
    }
  });
});
