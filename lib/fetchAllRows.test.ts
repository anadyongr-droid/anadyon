import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PAGES, PAGE_SIZE, fetchAllRows } from "./fetchAllRows";

const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** A fake table of `total` rows, recording the ranges it was asked for. */
function fakeTable(total: number, pageSize = PAGE_SIZE) {
  const calls: [number, number][] = [];
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    // Mirrors PostgREST: a range beyond the end returns an empty set, and a
    // range wider than `max-rows` is clamped rather than refused.
    return { data: all.slice(from, Math.min(to + 1, from + pageSize)), error: null };
  };
  return { page, calls };
}

describe("every row is read, not the first page of them", () => {
  it("assembles several pages into one list", async () => {
    const { page, calls } = fakeTable(2_500);
    const result = await fetchAllRows<{ id: number }>(page);

    expect(result.rows).toHaveLength(2_500);
    expect(result.truncated).toBe(false);
    expect(result.error).toBeNull();
    // 1000 + 1000 + 500 — the short third page ends it.
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("returns the rows in order, with none duplicated or dropped", async () => {
    const { page } = fakeTable(2_101);
    const { rows } = await fetchAllRows<{ id: number }>(page);
    expect(rows.map(r => r.id)).toEqual(Array.from({ length: 2_101 }, (_, i) => i));
  });

  it("asks once more when a page comes back exactly full", async () => {
    // The boundary case. A final page of exactly PAGE_SIZE is indistinguishable
    // from a full one with more behind it, so the loop must not assume it is the
    // end — stopping there is precisely the bug being fixed, one page later.
    const { page, calls } = fakeTable(PAGE_SIZE);
    const { rows, truncated } = await fetchAllRows<{ id: number }>(page);

    expect(rows).toHaveLength(PAGE_SIZE);
    expect(truncated).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([1000, 1999]);
  });

  it("handles an empty table in one request", async () => {
    const { page, calls } = fakeTable(0);
    const { rows, truncated } = await fetchAllRows<{ id: number }>(page);
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("incomplete results say so", () => {
  it("flags truncation at the page ceiling instead of pretending to be complete", async () => {
    const { page, calls } = fakeTable(50, 2);
    const { rows, truncated, error } = await fetchAllRows<{ id: number }>(page, {
      pageSize: 2,
      maxPages: 3,
    });

    expect(calls).toHaveLength(3);
    expect(rows).toHaveLength(6);
    expect(truncated, "six of fifty rows must never report as complete").toBe(true);
    expect(error).toBeNull();
  });

  it("keeps the rows it already has when a later page fails, and flags them", async () => {
    let n = 0;
    const page = async () => {
      n++;
      if (n === 1) return { data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null };
      return { data: null, error: { message: "connection reset" } };
    };
    const result = await fetchAllRows<{ id: number }>(page);

    expect(result.rows).toHaveLength(PAGE_SIZE);
    expect(result.truncated).toBe(true);
    expect(result.error).toBe("connection reset");
  });

  it("treats a null data page as empty rather than throwing", async () => {
    const result = await fetchAllRows<{ id: number }>(async () => ({ data: null, error: null }));
    expect(result.rows).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("the ceiling is high enough that reaching it means something is wrong", () => {
    expect(MAX_PAGES * PAGE_SIZE).toBeGreaterThanOrEqual(50_000);
  });
});

describe("both capped competitor queries are paged", () => {
  // These are the two the audit found. Each read competitor_rates unbounded, so
  // PostgREST returned at most 1,000 rows and both routes computed over that
  // slice — averages and diff percentages in one, observation counts and price
  // ranges in the other — with nothing in the response to show rows were missing.
  const routes = [
    ["app/api/admin/competitors/comparison/route.ts", "comparison"],
    ["app/api/admin/competitors/mapping/route.ts", "mapping"],
  ] as const;

  it.each(routes)("%s pages its competitor_rates read", file => {
    const src = read(file);
    expect(src, "the unbounded read is back").toContain("fetchAllRows");
    expect(src).toContain(".range(from, to)");
  });

  it.each(routes)("%s orders the paged read by a stable key", file => {
    const src = read(file);
    // Paging an unordered query is undefined — PostgreSQL may hand back rows in
    // a different physical order between pages, duplicating some and skipping
    // others. Ordering by the primary key is what makes the pages disjoint.
    const paged = src.slice(src.indexOf("fetchAllRows"));
    expect(paged.indexOf(".range(from, to)"), "no .range in the paged block").toBeGreaterThan(-1);
    expect(
      paged.slice(0, paged.indexOf(".range(from, to)")),
      "the paged query must .order() before it .range()s"
    ).toMatch(/\.order\(\s*["']id["']/);
  });

  it("the comparison response reports whether it is complete", () => {
    expect(read(routes[0][0])).toMatch(/truncated:\s*observations\.truncated/);
  });

  it("the mapping response reports whether it is complete", () => {
    expect(read(routes[1][0])).toMatch(/truncated:\s*observations\.truncated/);
  });

  it("no competitor_rates read is left unbounded", () => {
    // Reads only. `.from("competitor_rates").update(...)` in the mapping PATCH
    // is a write: it has no result set to be capped, and the first version of
    // this test failed on it — the assertion was right, the population was not.
    //
    // The freshness queries are exempt for a real reason: each asks for a single
    // newest row with .limit(1), which the cap cannot affect.
    for (const [file] of routes) {
      const src = read(file);
      for (const m of src.matchAll(/\.from\("competitor_rates"\)/g)) {
        const after = src.slice(m.index, m.index + 600);
        // The chained call that follows decides what this is.
        const isRead = /^[\s\S]{0,40}\.select\(/.test(after.slice(".from(\"competitor_rates\")".length));
        if (!isRead) continue;
        const bounded = after.includes(".range(from, to)") || after.includes(".limit(");
        expect(bounded, `unbounded competitor_rates read in ${file}`).toBe(true);
      }
    }
  });
});
