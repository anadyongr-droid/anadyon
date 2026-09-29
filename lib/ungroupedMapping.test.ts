import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");
const ROUTE = read("app/api/admin/competitors/mapping/route.ts");

/**
 * A competitor category with no group code could be mapped in the UI, saved,
 * and never appear in the comparison — reported as "Saved — 0 observations
 * classified" and otherwise silent. Scooters were the visible casualty.
 *
 * The GET renders a null `car_group` as "?", and the PATCH sent that string
 * back as `.eq("car_group", "?")`. SQL's `=` never matches NULL, so the update
 * affected no rows.
 */
describe("SQL equality never matches NULL, which is the whole defect", () => {
  it("REPRODUCES: the sentinel is a string and the stored value is null", () => {
    // Asserting the precondition, so the test cannot pass against a repro that
    // could not exhibit the bug.
    const stored: string | null = null;
    const displayed = stored ?? "?";
    expect(displayed).toBe("?");
    // This is the comparison the old query performed, in SQL terms.
    expect(stored === displayed).toBe(false);
  });

  it("three of the four importers can write a null group, so this is not an edge case", () => {
    // Only Podilatadiko always has a segment. EzCar's scooters come from a
    // different endpoint where a car-group code does not exist.
    expect(read("lib/competitorRates.ts")).toContain("car_group: v.carGroup ?? null");
    expect(read("lib/farosRates.ts")).toContain("car_group: v.vehicleCategory ?? null");
    expect(read("lib/carRentalsRates.ts")).toMatch(/car_group:.*\|\| null/);
  });
});

describe("the route matches a null group with is(), not eq()", () => {
  it("branches on the sentinel", () => {
    expect(ROUTE).toContain("m.car_group === UNGROUPED");
    expect(ROUTE).toMatch(/\.is\("car_group",\s*null\)/);
  });

  it("still uses eq for a real group code", () => {
    expect(ROUTE).toMatch(/\.eq\("car_group",\s*m\.car_group\)/);
  });

  it("the sentinel is declared once rather than repeated as a literal", () => {
    // It appeared three times as a bare "?" — display, key and query — and the
    // query was the one that was wrong. A shared constant makes the three
    // uses visibly the same decision.
    expect(ROUTE).toContain('export const UNGROUPED = "?"');
    expect(ROUTE).toContain("r.car_group ?? UNGROUPED");
    // No bare "?" sentinel left behind in the grouping or display paths.
    expect(ROUTE).not.toMatch(/car_group \?\? "\?"/);
  });

  it("the competitor filter applies to both branches", () => {
    // Building the query once and branching only on the group is what keeps
    // .eq("competitor") from being dropped on one path — which would have
    // reclassified every competitor's ungrouped rows at once.
    const patch = ROUTE.slice(ROUTE.indexOf("export async function PATCH"));
    const build = patch.slice(patch.indexOf("const query = supabaseAdmin"), patch.indexOf("if (!error)"));
    expect(build).toContain('.eq("competitor", m.competitor)');
    expect((build.match(/\.eq\("competitor"/g) ?? []).length).toBe(1);
  });
});
