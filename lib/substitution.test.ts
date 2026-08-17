import { describe, it, expect } from "vitest";
import { checkSubstitution, expectedTransmission } from "./substitution";

/**
 * These began as a throwaway script run once and deleted. That is how the two
 * faults below reached production in the first place: the transmission check
 * sat behind a pricing-group lookup that always failed, and "Any" was taken at
 * face value against a model that is plainly manual.
 *
 * Both are pinned here so a future change to the guard has to break a test
 * rather than a booking.
 */

const car = (group: string, transmission: string, name: string) =>
  ({ pricing_group: group, transmission, name });

describe("transmission is never crossed", () => {
  it("refuses an automatic against a manual booking", () => {
    const r = checkSubstitution(
      { pricing_group: "car_a", transmission: "Manual", model: "Fiat Panda" },
      car("car_c", "Automatic", "Peugeot 107")
    );
    expect(r.verdict).toBe("blocked");
    expect(r.message).toMatch(/manual/i);
  });

  it("refuses a manual against an automatic booking", () => {
    const r = checkSubstitution(
      { pricing_group: "car_c", transmission: "Automatic", model: "Peugeot 107" },
      car("car_a", "Manual", "Fiat Panda")
    );
    expect(r.verdict).toBe("blocked");
    // The customer may not legally be able to drive it — that reason, not price.
    expect(r.message).toMatch(/may not be able to drive/i);
  });

  it("REGRESSION: blocks even when the quote has no pricing group", () => {
    // Every quote taken before migration 010 has pricing_group NULL. The guard
    // used to return "ok" here without examining transmission at all.
    const r = checkSubstitution(
      { pricing_group: null, transmission: "Any", model: "Fiat Panda" },
      car("car_c", "Automatic", "Peugeot 107")
    );
    expect(r.verdict).toBe("blocked");
  });

  it('REGRESSION: infers the expectation from the model when transmission is "Any"', () => {
    // "Any" means no preference among the options offered, not indifference to
    // what gets driven away. A Fiat Panda is a manual car.
    expect(expectedTransmission({ transmission: "Any", model: "Fiat Panda" })).toBe("Manual");
    expect(expectedTransmission({ transmission: "Any", model: "Peugeot 107" })).toBe("Automatic");
    expect(expectedTransmission({ transmission: "Manual", model: "Peugeot 107" })).toBe("Manual");
  });

  it("has nothing to judge when the model is unrecognised", () => {
    expect(expectedTransmission({ transmission: "Any", model: "Some New Model" })).toBeNull();
  });
});

describe("category direction", () => {
  it("treats a higher category as a free upgrade", () => {
    const r = checkSubstitution(
      { pricing_group: "car_a", transmission: "Manual", model: "Fiat Panda" },
      car("car_b", "Manual", "Hyundai i20")
    );
    expect(r.verdict).toBe("upgrade");
    expect(r.message).toMatch(/keep the quoted price/i);
  });

  it("treats a lower category as a downgrade needing consent", () => {
    const r = checkSubstitution(
      { pricing_group: "car_b", transmission: "Manual", model: "Hyundai i20" },
      car("car_a", "Manual", "Fiat Panda")
    );
    expect(r.verdict).toBe("downgrade");
    expect(r.message).toMatch(/agreement/i);
  });

  it("passes an identical category", () => {
    const r = checkSubstitution(
      { pricing_group: "car_a", transmission: "Manual", model: "Fiat Panda" },
      car("car_a", "Manual", "Nissan Micra")
    );
    expect(r.verdict).toBe("ok");
  });
});

describe("cross-family swaps are refused in every direction", () => {
  const families = [
    ["car_a", "Manual", "Fiat Panda"],
    ["motorbike_a", "Automatic", "Kymco 50cc"],
    ["bike", "", "Scott Sportster"],
  ] as const;

  for (const [qg, qt, qm] of families) {
    for (const [ag, at, an] of families) {
      const sameFamily = qg.split("_")[0] === ag.split("_")[0];
      if (sameFamily) continue;
      it(`${qg} → ${ag} is blocked`, () => {
        const r = checkSubstitution(
          { pricing_group: qg, transmission: qt || null, model: qm },
          car(ag, at, an)
        );
        expect(r.verdict).toBe("blocked");
      });
    }
  }
});

describe("a booking with no quote behind it", () => {
  it("passes, because there is nothing to compare against", () => {
    const r = checkSubstitution({}, car("car_a", "Manual", "Fiat Panda"));
    expect(r.verdict).toBe("ok");
  });
});
