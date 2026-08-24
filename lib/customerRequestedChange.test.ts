import { describe, expect, it } from "vitest";
import { checkSubstitution, consentCanPermit } from "./substitution";

/**
 * What a recorded customer request may and may not permit.
 *
 * The substitution rules exist to stop a customer being handed something other
 * than what they booked. A customer ringing up to ask for an automatic, or to
 * accept a smaller car, is the opposite situation — and the refusal messages
 * already said "agree the change with them first" while giving staff no way to
 * record that they had.
 *
 * The line this pins: consent can permit what a customer is genuinely able to
 * agree to, and nothing else. A car booking cannot become a bicycle because
 * somebody ticked a box, and no agreement supplies a transmission the fleet
 * record does not hold.
 */
const manualQuote = { pricing_group: "car_a", vehicle_type: "Cars", transmission: "Manual", model: "Fiat Panda" };
const automaticCar = { pricing_group: "car_c", category: "car", transmission: "Automatic", name: "Peugeot 107" };

describe("changes a customer can agree to", () => {
  it("manual booked, automatic given", () => {
    const check = checkSubstitution(manualQuote, automaticCar);
    expect(check.verdict).toBe("blocked");
    expect(check.reason).toBe("transmission_mismatch");
    expect(consentCanPermit(check)).toBe(true);
  });

  it("automatic booked, manual given", () => {
    const check = checkSubstitution(
      { pricing_group: "car_c", vehicle_type: "Cars", transmission: "Automatic", model: "Peugeot 107" },
      { pricing_group: "car_a", category: "car", transmission: "Manual", name: "Fiat Panda" },
    );
    expect(check.reason).toBe("transmission_mismatch");
    expect(consentCanPermit(check)).toBe(true);
  });

  it("a lower category than booked", () => {
    const check = checkSubstitution(
      { pricing_group: "car_b", vehicle_type: "Cars", transmission: "Manual", model: "Hyundai i20" },
      { pricing_group: "car_a", category: "car", transmission: "Manual", name: "Fiat Panda" },
    );
    expect(check.verdict).toBe("downgrade");
    expect(check.reason).toBe("downgrade");
    expect(consentCanPermit(check)).toBe(true);
  });
});

describe("changes no amount of agreement can permit", () => {
  it("a car booking becoming a bicycle", () => {
    // A different product, not a substitution — the message says raise a new
    // quote, and a tick box must not talk anyone out of that.
    const check = checkSubstitution(manualQuote, {
      pricing_group: "bike", category: "bike", name: "Kona Lanai",
    });
    expect(check.verdict).toBe("blocked");
    expect(check.reason).toBe("family");
    expect(consentCanPermit(check)).toBe(false);
  });

  it("a car whose transmission is not recorded", () => {
    // Missing data, not a decision. Consent cannot supply the fact.
    const check = checkSubstitution(manualQuote, {
      pricing_group: "car_a", category: "car", transmission: null, name: "Unknown Car",
    });
    expect(check.verdict).toBe("blocked");
    expect(check.reason).toBe("transmission_unknown");
    expect(consentCanPermit(check)).toBe(false);
  });

  it("a motorbike against a car booking", () => {
    const check = checkSubstitution(manualQuote, {
      pricing_group: "motorbike_a", category: "motorbike", transmission: "Automatic", name: "Kymco Agility 50cc",
    });
    expect(check.reason).toBe("family");
    expect(consentCanPermit(check)).toBe(false);
  });
});

describe("assignments that were never blocked stay unblocked", () => {
  it("a free upgrade needs no consent", () => {
    const check = checkSubstitution(
      { pricing_group: "car_a", vehicle_type: "Cars", transmission: "Manual", model: "Fiat Panda" },
      { pricing_group: "car_b", category: "car", transmission: "Manual", name: "Hyundai i20" },
    );
    expect(check.verdict).toBe("upgrade");
    // No reason set, so the checkbox never appears for it.
    expect(consentCanPermit(check)).toBe(false);
  });

  it("the same category needs no consent", () => {
    const check = checkSubstitution(manualQuote, {
      pricing_group: "car_a", category: "car", transmission: "Manual", name: "Hyundai i10",
    });
    expect(check.verdict).toBe("ok");
    expect(consentCanPermit(check)).toBe(false);
  });
});

describe("every refusal says why, in a form code can branch on", () => {
  it("no blocked or downgraded verdict is left without a reason", () => {
    // Matching the message text to tell these apart would break on any
    // rewording; a missing reason would silently make consent impossible.
    const cases = [
      checkSubstitution(manualQuote, automaticCar),
      checkSubstitution(manualQuote, { pricing_group: "bike", category: "bike", name: "Kona Lanai" }),
      checkSubstitution(manualQuote, { pricing_group: "car_a", category: "car", transmission: null, name: "X" }),
      checkSubstitution(
        { pricing_group: "car_b", vehicle_type: "Cars", transmission: "Manual", model: "Hyundai i20" },
        { pricing_group: "car_a", category: "car", transmission: "Manual", name: "Fiat Panda" },
      ),
    ];
    for (const check of cases) {
      if (check.verdict === "blocked" || check.verdict === "downgrade") {
        expect(check.reason, check.message).toBeDefined();
      }
    }
  });
});
