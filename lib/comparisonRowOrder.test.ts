import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");
const ROUTE = read("app/api/admin/competitors/comparison/route.ts");

/**
 * Reproduces the reported ordering, then pins the fix.
 *
 * The comparison loop iterates `rates` on the outside and months on the inside.
 * `rates` is fetched with no ORDER BY, so a pricing group with three seasons
 * emitted its months grouped by season: August, October, September — which is
 * what was read off the live screen.
 */
const BANDS = [
  { key: "1_2", field: "rate_1_2" },
  { key: "3_6", field: "rate_3_6" },
  { key: "7plus", field: "rate_7plus" },
] as const;

interface Row { pricing_group: string; month: number; band: string }

/** The loop as it stands, given a season ordering Postgres is free to return. */
function buildRows(seasons: { months: number[] }[], months: number[]): Row[] {
  const rows: Row[] = [];
  for (const season of seasons) {
    for (const month of months) {
      if (!season.months.includes(month)) continue;
      for (const band of BANDS) rows.push({ pricing_group: "car_a", month, band: band.key });
    }
  }
  return rows;
}

function sortRows(rows: Row[]): Row[] {
  const bandOrder = new Map<string, number>(BANDS.map((b, i) => [b.key, i]));
  return [...rows].sort(
    (a, b) =>
      a.pricing_group.localeCompare(b.pricing_group) ||
      a.month - b.month ||
      (bandOrder.get(a.band) ?? 0) - (bandOrder.get(b.band) ?? 0)
  );
}

describe("months render in calendar order", () => {
  // Three season rows, returned in an order that puts October before September.
  const seasons = [{ months: [8] }, { months: [10] }, { months: [9] }];
  const months = [8, 9, 10];

  it("REPRODUCES: the unsorted loop really does emit August, October, September", () => {
    // Asserting the bug exists before asserting the fix. A regression test that
    // cannot exhibit the defect proves nothing about the defect.
    const unsorted = buildRows(seasons, months);
    expect([...new Set(unsorted.map(r => r.month))]).toEqual([8, 10, 9]);
  });

  it("and that the months array itself was already sorted, which hid it", () => {
    // The sort was real. It was applied one loop too far in, so it ordered the
    // months within each season rather than across them.
    expect(months).toEqual([...months].sort((a, b) => a - b));
  });

  it("sorting puts them back in calendar order", () => {
    const sorted = sortRows(buildRows(seasons, months));
    expect([...new Set(sorted.map(r => r.month))]).toEqual([8, 9, 10]);
  });

  it("keeps duration bands in 1–2, 3–6, 7+ order, not alphabetical", () => {
    // Alphabetically "1_2" < "3_6" < "7plus" happens to agree, so sorting the
    // key as a string passes by luck. Declaration order is what is meant, and
    // a renamed band must not silently reorder the columns.
    const sorted = sortRows(buildRows([{ months: [9] }], [9]));
    expect(sorted.map(r => r.band)).toEqual(["1_2", "3_6", "7plus"]);
  });

  it("groups stay together rather than interleaving", () => {
    const rows = [
      { pricing_group: "car_b", month: 9, band: "1_2" },
      { pricing_group: "car_a", month: 10, band: "1_2" },
      { pricing_group: "car_b", month: 8, band: "1_2" },
      { pricing_group: "car_a", month: 8, band: "1_2" },
    ];
    expect(sortRows(rows).map(r => `${r.pricing_group}:${r.month}`)).toEqual([
      "car_a:8", "car_a:10", "car_b:8", "car_b:9",
    ]);
  });
});

describe("the route applies it", () => {
  it("sorts the rows before returning them", () => {
    expect(ROUTE).toMatch(/rows\.sort\(/);
    expect(ROUTE).toContain("a.month - b.month");
  });

  it("orders bands by declaration rather than by key", () => {
    expect(ROUTE).toMatch(/bandOrder\s*=\s*new Map\(BANDS\.map/);
  });

  it("sorts after the loop, not inside it", () => {
    // Sorting inside would order months within one season and change nothing,
    // which is the shape of the original defect.
    const loopEnd = ROUTE.indexOf("const bandOrder");
    expect(loopEnd).toBeGreaterThan(ROUTE.indexOf("for (const rate of"));
    expect(ROUTE.indexOf("rows.sort(")).toBeGreaterThan(loopEnd);
  });
});
