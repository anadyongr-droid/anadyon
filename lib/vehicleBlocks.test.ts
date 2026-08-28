import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The manual half of the phase-1 safety kernel.
 *
 * The database refuses to *allocate* a blocked vehicle automatically. Nothing
 * stopped a member of staff assigning one by hand from the Reservations screen,
 * which is the likelier failure: the car is in the list, and there is a
 * customer at the counter.
 */
const mocks = vi.hoisted(() => ({
  result: { data: [] as unknown[], error: null as { message: string } | null },
  /** Every filter the query applied, so the overlap predicate can be asserted. */
  filters: [] as Array<[string, ...unknown[]]>,
}));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lte", "or", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      mocks.filters.push([method, ...args]);
      // `limit` ends the chain; the rest keep it going.
      return method === "limit" ? Promise.resolve(mocks.result) : chain;
    };
  }
  return { supabaseAdmin: { from: (table: string) => { mocks.filters.push(["from", table]); return chain; } } };
});

const { vehicleBlockProblem, describeBlock } = await import("./vehicleBlocks");

const RENTAL = ["vehicle-1", "2026-09-10", "2026-09-14"] as const;

beforeEach(() => {
  mocks.result.data = [];
  mocks.result.error = null;
  mocks.filters.length = 0;
});

describe("assigning a vehicle by hand", () => {
  it("permits a vehicle with no overlapping block", async () => {
    expect(await vehicleBlockProblem(...RENTAL)).toBeNull();
  });

  it("refuses a blocked vehicle, saying which block and why", async () => {
    // A refusal a person cannot explain gets worked around, so the message
    // carries the reason and the dates rather than only "no".
    mocks.result.data = [{ reason: "statutory", starts_on: "2026-09-08", ends_on: "2026-09-12", note: "KTEO due" }];
    const problem = await vehicleBlockProblem(...RENTAL);
    expect(problem).toContain("statutory block");
    expect(problem).toContain("2026-09-08");
    expect(problem).toContain("KTEO due");
  });

  it("says an open-ended block has no end date rather than printing null", async () => {
    mocks.result.data = [{ reason: "damage", starts_on: "2026-09-01", ends_on: null, note: null }];
    expect(await vehicleBlockProblem(...RENTAL)).toContain("no end date set");
  });

  it("FAILS CLOSED when the blocks table cannot be read", async () => {
    // §5.3: a read must never let "cannot reach the database" look like
    // "nothing found". Here the two differ by whether a car on a ramp is handed
    // to a customer, so the assignment is refused rather than allowed.
    mocks.result.error = { message: "connection terminated" };
    const problem = await vehicleBlockProblem(...RENTAL);
    expect(problem, "an unreadable check must refuse, not permit").not.toBeNull();
    expect(problem).toContain("not saved");
  });

  it("asks the database for blocks that overlap the rental, inclusive at both ends", async () => {
    // starts_on <= return_date, and ends_on either open or >= pickup_date.
    // Getting either bound wrong frees a vehicle on the day it is in the
    // workshop, and no message would say so.
    await vehicleBlockProblem(...RENTAL);
    expect(mocks.filters).toContainEqual(["from", "vehicle_blocks"]);
    expect(mocks.filters).toContainEqual(["eq", "vehicle_id", "vehicle-1"]);
    expect(mocks.filters).toContainEqual(["lte", "starts_on", "2026-09-14"]);
    expect(mocks.filters).toContainEqual(["or", "ends_on.is.null,ends_on.gte.2026-09-10"]);
  });

  it("refuses a date that is not an ISO calendar date, before it reaches the filter", async () => {
    // The .or() below takes a PostgREST filter EXPRESSION, so the date lands in
    // query syntax rather than beside it as a bound parameter — unlike .eq()
    // and .lte(). Callers pass body.pickup_date straight off the request JSON.
    //
    // Refusing here fails closed, like every other path in this guard.
    for (const bad of ["2026-09-10,id.not.is.null", "not-a-date", "2026-9-1", ""]) {
      const problem = await vehicleBlockProblem("vehicle-1", bad, "2026-09-14");
      // The empty string is "nothing submitted" and is permitted; the rest are
      // malformed and must not reach the query.
      if (bad === "") expect(problem).toBeNull();
      else expect(problem, `"${bad}" should not reach the filter`).toContain("not saved");
    }
    expect(mocks.filters.filter((f) => f[0] === "or")).toHaveLength(0);
  });

  it("does not query at all when no vehicle or no dates were submitted", async () => {
    // Saving a reservation without touching the car must not become a database
    // round trip, nor a refusal.
    expect(await vehicleBlockProblem(undefined, "2026-09-10", "2026-09-14")).toBeNull();
    expect(await vehicleBlockProblem("vehicle-1", "", "2026-09-14")).toBeNull();
    expect(mocks.filters).toHaveLength(0);
  });
});

describe("the message shown to staff", () => {
  it("names each reason in words rather than the stored token", () => {
    for (const [reason, expected] of [
      ["maintenance", "is in maintenance"],
      ["statutory", "statutory block"],
      ["damage", "off the road with damage"],
      ["hold", "is on hold"],
    ] as const) {
      expect(describeBlock({ reason, starts_on: "2026-09-08", ends_on: "2026-09-12", note: null })).toContain(expected);
    }
  });

  it("falls back to a plain wording for a reason it does not know", () => {
    // The check constraint should prevent this, but a message reading
    // "This vehicle undefined from …" would be worse than a vague one.
    expect(describeBlock({ reason: "something_new", starts_on: "2026-09-08", ends_on: null, note: null }))
      .toContain("is blocked");
  });
});
