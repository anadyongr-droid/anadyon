import { describe, expect, it } from "vitest";
import {
  applyProposals,
  computeTargetRates,
  roundToStep,
  summariseProposals,
  type ComparisonRow,
  type TargetSpec,
} from "./targetPricing";

const FAROS = "farosrentals";

function row(over: Partial<ComparisonRow> = {}): ComparisonRow {
  return {
    rate_id: "r1",
    rate_field: "rate_3_6",
    pricing_group: "car_a",
    month: 10,
    month_name: "October",
    band: "3_6",
    band_label: "3–6 days",
    ours: 30,
    competitors: [{ competitor: FAROS, label: "Faros Rentals", price: 25 }],
    ...over,
  };
}

/** Tasos's four answers, 29 September: all Faros rates, 3-day proxy, €0.50, mapped groups. */
const SPEC: TargetSpec = { competitor: FAROS, deltaPct: -2, months: [10], roundTo: 0.5 };

describe("rounding lands on the step Tasos asked for", () => {
  it.each([
    [18.73, 18.5],
    [18.76, 19],
    [18.25, 18.5],
    [18.0, 18],
  ])("%s rounds to %s at a 0.50 step", (value, expected) => {
    expect(roundToStep(value, 0.5)).toBe(expected);
  });

  it("rounds a .5 boundary up rather than to even", () => {
    // Banker's rounding would send 18.25 to 18.0 and 18.75 to 19.0 — the same
    // input landing differently depending on parity is not something a rate
    // card should do.
    expect(roundToStep(18.25, 0.5)).toBe(18.5);
    expect(roundToStep(18.75, 0.5)).toBe(19);
  });

  it("falls back to cents when the step is nonsense", () => {
    expect(roundToStep(18.734, 0)).toBe(18.73);
    expect(roundToStep(18.734, -1)).toBe(18.73);
  });
});

describe("the worked example: 2% cheaper than Faros for October", () => {
  it("prices below them and rounds to the step", () => {
    // 25.00 × 0.98 = 24.50 exactly.
    const { proposals } = computeTargetRates([row()], SPEC);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      current: 30,
      competitor: 25,
      proposed: 24.5,
      change: -5.5,
    });
  });

  it("can raise a price as well as cut one", () => {
    // Being 2% below a competitor who charges more than us is a rise. The tool
    // positions; it does not assume the answer is always cheaper.
    const { proposals } = computeTargetRates([row({ ours: 20, competitors: [{ competitor: FAROS, label: "F", price: 25 }] })], SPEC);
    expect(proposals[0].proposed).toBe(24.5);
    expect(proposals[0].change).toBe(4.5);
  });

  it("handles a positive delta", () => {
    const { proposals } = computeTargetRates([row()], { ...SPEC, deltaPct: 10 });
    expect(proposals[0].proposed).toBe(27.5);
  });
});

describe("the 1–2 day band is flagged as a proxy, not passed off as a quote", () => {
  it("marks Faros' short band", () => {
    // Faros enforces a three-day minimum, so the stored 1–2 day figure is their
    // 3-day rate ÷ 3. Tasos chose to reprice off it; a reader must still be
    // told it is synthetic.
    const { proposals } = computeTargetRates(
      [row({ band: "1_2", rate_field: "rate_1_2", band_label: "1–2 days" })],
      SPEC
    );
    expect(proposals[0].proxy).toBe(true);
  });

  it("does not mark the other bands", () => {
    expect(computeTargetRates([row()], SPEC)[
      "proposals"
    ][0].proxy).toBe(false);
  });

  it("does not mark another competitor's short band", () => {
    // Only Faros has the three-day minimum. The flag is about that rule, not
    // about the band.
    const other = row({ band: "1_2", competitors: [{ competitor: "ionianrentals", label: "I", price: 25 }] });
    const { proposals } = computeTargetRates([other], { ...SPEC, competitor: "ionianrentals" });
    expect(proposals[0].proxy).toBe(false);
  });
});

describe("what is skipped, and why it is kept rather than dropped", () => {
  it("names a month outside the chosen ones", () => {
    const { proposals, skipped } = computeTargetRates([row({ month: 9, month_name: "September" })], SPEC);
    expect(proposals).toEqual([]);
    expect(skipped[0].reason).toBe("outside the chosen months");
  });

  it("names a group this competitor does not sell", () => {
    // Tasos's scope: groups with a mapped Faros equivalent. An unmapped one is
    // not an error, but it must not vanish either — a group silently missing
    // from a repricing looks like one the tool chose to leave alone.
    const { skipped } = computeTargetRates([row({ competitors: [] })], SPEC);
    expect(skipped[0].reason).toBe("no mapped price from this competitor");
  });

  it("refuses a zero competitor price rather than proposing a free rental", () => {
    const { proposals, skipped } = computeTargetRates([row({ competitors: [{ competitor: FAROS, label: "F", price: 0 }] })], SPEC);
    expect(proposals).toEqual([]);
    expect(skipped[0].reason).toBe("their price is zero or negative");
  });

  it("refuses a price that rounds to zero", () => {
    const { proposals, skipped } = computeTargetRates(
      [row({ competitors: [{ competitor: FAROS, label: "F", price: 0.2 }] })],
      { ...SPEC, deltaPct: -90 }
    );
    expect(proposals).toEqual([]);
    expect(skipped[0].reason).toBe("rounds to zero or below");
  });

  it("an empty month list means every month", () => {
    const rows = [row({ month: 9, month_name: "September" }), row({ month: 10 })];
    const { proposals } = computeTargetRates(rows, { ...SPEC, months: [] });
    expect(proposals).toHaveLength(2);
  });
});

describe("applying proposals to the editor's drafts", () => {
  const rates = [
    { id: "r1", rate_1_2: 40, rate_3_6: 30, rate_7plus: 25 },
    { id: "r2", rate_1_2: 50, rate_3_6: 45, rate_7plus: 40 },
  ];

  it("changes only the fields named, and only on the rates named", () => {
    const { proposals } = computeTargetRates([row()], SPEC);
    const next = applyProposals(rates, proposals);
    expect(next[0]).toEqual({ id: "r1", rate_1_2: 40, rate_3_6: 24.5, rate_7plus: 25 });
    // Repricing one month must never silently rewrite an untouched season.
    expect(next[1]).toEqual(rates[1]);
  });

  it("does not mutate the caller's drafts", () => {
    const { proposals } = computeTargetRates([row()], SPEC);
    applyProposals(rates, proposals);
    expect(rates[0].rate_3_6).toBe(30);
  });

  it("applies several bands of the same rate row together", () => {
    const { proposals } = computeTargetRates(
      [row(), row({ band: "1_2", rate_field: "rate_1_2", band_label: "1–2 days" })],
      SPEC
    );
    const next = applyProposals(rates, proposals);
    expect(next[0].rate_3_6).toBe(24.5);
    expect(next[0].rate_1_2).toBe(24.5);
  });
});

describe("the summary a person reads before pressing Save", () => {
  it("counts the direction of travel and names the proxy", () => {
    const result = computeTargetRates(
      [row(), row({ band: "1_2", rate_field: "rate_1_2", ours: 10 }), row({ month: 9 })],
      SPEC
    );
    const text = summariseProposals(result, SPEC);
    expect(text).toContain("2 rates set 2% below them");
    expect(text).toContain("1 down, 1 up");
    expect(text).toContain("1 using their 3-day rate as a proxy");
    expect(text).toContain("1 skipped");
  });

  it("says plainly when nothing would change", () => {
    const result = computeTargetRates([row({ competitors: [] })], SPEC);
    expect(summariseProposals(result, SPEC)).toMatch(/^Nothing to change/);
  });
});

describe("the module cannot write a price", () => {
  it("exports no function that touches the database", async () => {
    // §13: prices may be drafted but not deployed without Tasos's explicit
    // approval of the specific change. The safeguard is structural — there is
    // no write path here, so the existing admin-only Save is the only way a
    // proposal can become a rate.
    const src = await import("node:fs").then(fs =>
      fs.readFileSync(new URL("./targetPricing.ts", import.meta.url).pathname, "utf8")
    );
    expect(src).not.toContain("supabaseAdmin");
    expect(src).not.toContain("fetch(");
  });
});
