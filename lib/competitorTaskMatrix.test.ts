import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

import {
  buildTaskMatrix,
  taskMatrixShape,
  DURATIONS,
  EZCAR_TENANTS,
} from "./competitorRates";

const DATES = [new Date(2026, 7, 25), new Date(2026, 8, 15), new Date(2026, 9, 15)];

describe("the bike searches run early enough to survive a partial pass", () => {
  it("puts a bike search in the first handful of tasks", () => {
    // They used to be appended: tasks 19 to 27 of 27, starting about three
    // minutes into a four-and-a-half minute pass. Every pass left early
    // collected cars and no bikes at all, which is why the mapping table had no
    // scooter rows and motorbikes were reported missing from the Market screen.
    const tasks = buildTaskMatrix(DATES);
    const firstBike = tasks.findIndex(t => t.isBike);

    expect(firstBike).toBeGreaterThanOrEqual(0);
    expect(firstBike).toBeLessThan(5);
  });

  it("collects both fleets in any prefix long enough to hold one of each", () => {
    // The property that matters is not the exact order but that stopping early
    // leaves a representative sample rather than a complete sample of one fleet.
    const tasks = buildTaskMatrix(DATES);
    const prefix = tasks.slice(0, 6);

    expect(prefix.some(t => t.isBike)).toBe(true);
    expect(prefix.some(t => !t.isBike)).toBe(true);
  });

  it("still runs every search exactly once", () => {
    const tasks = buildTaskMatrix(DATES);
    const withBikes = EZCAR_TENANTS.filter(t => t.hasBikes).length;
    const expected =
      (EZCAR_TENANTS.length + withBikes) * DATES.length * DURATIONS.length;

    expect(tasks).toHaveLength(expected);
    expect(new Set(tasks.map(t => `${t.tenant.slug}|${t.pickup.toISOString()}|${t.days}|${t.isBike}`)).size)
      .toBe(expected);
  });

  it("asks no tenant for a fleet it does not have", () => {
    // Motor Club Zante returns an empty set for bikes, so searching it is a
    // wasted request against a ten-second crawl delay.
    for (const task of buildTaskMatrix(DATES)) {
      if (task.isBike) expect(task.tenant.hasBikes).toBe(true);
    }
  });

  it("is deterministic, which is what makes a resume cursor meaningful", () => {
    const a = buildTaskMatrix(DATES).map(t => `${t.tenant.slug}${t.days}${t.isBike}`);
    const b = buildTaskMatrix(DATES).map(t => `${t.tenant.slug}${t.days}${t.isBike}`);
    expect(a).toEqual(b);
  });
});

describe("the stored shape tells a cursor whether it still means anything", () => {
  it("changes when the order changes", () => {
    const tasks = buildTaskMatrix(DATES);
    const appended = [...tasks.filter(t => !t.isBike), ...tasks.filter(t => t.isBike)];
    // The old bikes-last ordering. Same searches, different indices — which is
    // exactly the case a bare integer cursor cannot detect.
    expect(taskMatrixShape(appended)).not.toBe(taskMatrixShape(tasks));
  });

  it("changes when a tenant is added", () => {
    const tasks = buildTaskMatrix(DATES);
    const extra = [...tasks, { ...tasks[0], tenant: { ...tasks[0].tenant, slug: "newtenant" } }];
    expect(taskMatrixShape(extra)).not.toBe(taskMatrixShape(tasks));
  });

  it("changes when a duration changes", () => {
    const tasks = buildTaskMatrix(DATES);
    const altered = tasks.map((t, i) => (i === 3 ? { ...t, days: 99 } : t));
    expect(taskMatrixShape(altered)).not.toBe(taskMatrixShape(tasks));
  });

  it("does not change when only the pickup dates shift within the same plan", () => {
    // Dates move every month. Restarting a pass because the calendar advanced
    // would mean the cursor never survived, which defeats the point of having
    // one — the shape describes the plan, not the particular days.
    const later = DATES.map(d => new Date(d.getTime() + 86_400_000));
    expect(taskMatrixShape(buildTaskMatrix(later))).toBe(taskMatrixShape(buildTaskMatrix(DATES)));
  });

  it("is stable across calls", () => {
    expect(taskMatrixShape(buildTaskMatrix(DATES))).toBe(taskMatrixShape(buildTaskMatrix(DATES)));
  });
});
