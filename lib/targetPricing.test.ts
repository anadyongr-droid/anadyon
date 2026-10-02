import { describe, expect, it } from "vitest";
import type { Rate } from "@/lib/pricing";
import {
  applyProposals,
  computeTargetRates,
  monthsPresent,
  roundToStep,
  summariseProposals,
  summariseSkips,
  SKIP_REASONS,
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

describe("skips counted by reason, for the screen", () => {
  it("puts the operator's own filter last however large it is", () => {
    // Repricing one month skips every row of the other eleven, so this category
    // is always the biggest and always the least interesting. Sorting purely by
    // count would put it on top and push the data gaps below the fold.
    const rows = [
      ...Array.from({ length: 40 }, () => row({ month: 9, month_name: "September" })),
      row({ competitors: [] }),
      row({ competitors: [{ competitor: FAROS, label: "F", price: 0 }] }),
    ];
    const tallies = summariseSkips(computeTargetRates(rows, SPEC).skipped);

    expect(tallies.map(t => t.reason)).toEqual([
      SKIP_REASONS.noPrice,
      SKIP_REASONS.nonPositive,
      SKIP_REASONS.outsideMonths,
    ]);
    expect(tallies.at(-1)).toEqual({ reason: SKIP_REASONS.outsideMonths, count: 40 });
  });

  it("orders the gaps by how many rows they cost", () => {
    const rows = [
      row({ competitors: [] }),
      row({ competitors: [] }),
      row({ competitors: [{ competitor: FAROS, label: "F", price: 0 }] }),
    ];
    const tallies = summariseSkips(computeTargetRates(rows, SPEC).skipped);
    expect(tallies).toEqual([
      { reason: SKIP_REASONS.noPrice, count: 2 },
      { reason: SKIP_REASONS.nonPositive, count: 1 },
    ]);
  });

  it("is empty when nothing was skipped", () => {
    expect(summariseSkips([])).toEqual([]);
  });

  it("names the same reasons the engine produces", () => {
    // The screen groups on these strings. If a reason were typed twice and the
    // copies drifted, the category would silently split in two and nothing else
    // would notice.
    const skipped = computeTargetRates(
      [
        row({ month: 9 }),
        row({ competitors: [] }),
        row({ competitors: [{ competitor: FAROS, label: "F", price: -1 }] }),
      ],
      SPEC
    ).skipped;
    for (const s of skipped) {
      expect(Object.values(SKIP_REASONS)).toContain(s.reason);
    }
  });
});

describe("the month filter offered on screen", () => {
  it("lists each month once, in calendar order", () => {
    // The comparison arrives sorted by group first, so a group with three
    // seasons emits its months interleaved with another group's. Taking them in
    // arrival order would offer October before September.
    const rows = [
      row({ month: 10, month_name: "October" }),
      row({ month: 8, month_name: "August" }),
      row({ month: 10, month_name: "October" }),
      row({ month: 9, month_name: "September" }),
    ];
    expect(monthsPresent(rows)).toEqual([
      { month: 8, name: "August" },
      { month: 9, name: "September" },
      { month: 10, name: "October" },
    ]);
  });

  it("is empty when there is nothing to compare", () => {
    expect(monthsPresent([])).toEqual([]);
  });
});

describe("a rate row from lib/pricing can be repriced", () => {
  it("accepts an interface, not just an index-signature object", () => {
    // applyProposals once required `& Record<string, unknown>`, which reads as a
    // harmless description of a rate row but rejects every `interface` —
    // including the only type it is ever called with. This fails to compile
    // rather than at runtime, so it is here to be caught by `tsc`.
    const rate: Rate = {
      id: "r1",
      pricing_group: "car_a",
      season_name: "High",
      season_months: [10],
      rate_1_2: 40,
      rate_3_6: 30,
      rate_7plus: 25,
    };
    const { proposals } = computeTargetRates([row()], SPEC);
    expect(applyProposals([rate], proposals)[0].rate_3_6).toBe(24.5);
  });
});
