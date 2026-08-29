import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The manual half of the fleet gate — assigning a vehicle by hand from the
 * Reservations screen, which is the likelier failure of the two: the car is in
 * the list and there is a customer waiting.
 *
 * Blueprint §7.4. The rule under test is that an EXPECTED RETURN ENDS NOTHING.
 * The garage's date is a promise from a third party, and the first design let
 * it release the vehicle on its own.
 */
const mocks = vi.hoisted(() => ({
  result: { data: [] as unknown[], error: null as { message: string } | null },
  filters: [] as Array<[string, ...unknown[]]>,
}));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "lte", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      mocks.filters.push([method, ...args]);
      return method === "limit" ? Promise.resolve(mocks.result) : chain;
    };
  }
  return { supabaseAdmin: { from: (t: string) => { mocks.filters.push(["from", t]); return chain; } } };
});

const { vehicleBlockProblem, describeBlock, blockChase, REMIND_FROM_DAYS, ESCALATE_FROM_DAYS } =
  await import("./vehicleBlocks");

const openBlock = (over: Record<string, unknown> = {}) => ({
  id: "block-1", reason: "maintenance", starts_on: "2026-09-01",
  expected_return: "2026-09-12", note: null, ...over,
});

beforeEach(() => { mocks.result.data = []; mocks.result.error = null; mocks.filters.length = 0; });

describe("assigning a vehicle that is out of the fleet", () => {
  it("permits a vehicle with no open block", async () => {
    expect((await vehicleBlockProblem("vehicle-1", "2026-09-14", false)).problem).toBeNull();
  });

  it("refuses one that is out, saying since when and what was expected", async () => {
    mocks.result.data = [openBlock({ note: "gearbox" })];
    const { problem } = await vehicleBlockProblem("vehicle-1", "2026-09-14", false);
    expect(problem).toContain("maintenance");
    expect(problem).toContain("out since 2026-09-01");
    expect(problem).toContain("expected back 2026-09-12");
    expect(problem).toContain("gearbox");
  });

  it("asks only for OPEN blocks, and never bounds them by an end date", async () => {
    // The query is the rule. A released block is history; an open one has no
    // far end to compare against, so there is no upper bound to get wrong.
    await vehicleBlockProblem("vehicle-1", "2026-09-14", false);
    expect(mocks.filters).toContainEqual(["from", "vehicle_blocks"]);
    expect(mocks.filters).toContainEqual(["is", "released_at", null]);
    expect(mocks.filters).toContainEqual(["lte", "starts_on", "2026-09-14"]);
    expect(mocks.filters.some((f) => f[0] === "gte"), "an upper bound would let the estimate release it").toBe(false);
  });

  it("says so plainly when no return was estimated at all", async () => {
    mocks.result.data = [openBlock({ expected_return: null })];
    expect((await vehicleBlockProblem("vehicle-1", "2026-09-14", false)).problem)
      .toContain("no expected return recorded");
  });

  it("lets staff assign it anyway on attestation, and reports what was overridden", async () => {
    // A hard stop nobody can pass honestly is one they pass by deleting the
    // block, and the record goes with it.
    mocks.result.data = [openBlock()];
    const result = await vehicleBlockProblem("vehicle-1", "2026-09-14", true);
    expect(result.problem).toBeNull();
    expect(result.overridden?.reason).toBe("maintenance");
  });

  it("reports nothing overridden when nothing was blocked", async () => {
    // Otherwise every save by someone who ticks the box out of habit stamps an
    // override note onto a reservation that never needed one.
    expect((await vehicleBlockProblem("vehicle-1", "2026-09-14", true)).overridden).toBeNull();
  });

  it("FAILS CLOSED when the blocks table cannot be read", async () => {
    mocks.result.error = { message: "connection terminated" };
    const { problem } = await vehicleBlockProblem("vehicle-1", "2026-09-14", false);
    expect(problem, "an unreadable check must refuse, not permit").not.toBeNull();
    expect(problem).toContain("not saved");
  });

  it("refuses a return date that is not an ISO calendar date", async () => {
    for (const bad of ["not-a-date", "2026-9-1"]) {
      expect((await vehicleBlockProblem("vehicle-1", bad, false)).problem).toContain("not saved");
    }
  });

  it("does not query when no vehicle or no return date was submitted", async () => {
    expect((await vehicleBlockProblem(undefined, "2026-09-14", false)).problem).toBeNull();
    expect((await vehicleBlockProblem("vehicle-1", "", false)).problem).toBeNull();
    expect(mocks.filters).toHaveLength(0);
  });
});

describe("chasing a vehicle that has not come back", () => {
  const on = (d: string) => new Date(`${d}T09:00:00Z`);
  const out = (startsOn: string, expected: string | null = null) => ({ starts_on: startsOn, expected_return: expected });

  it("stays quiet for the first two days", async () => {
    // Nobody needs telling that a car which went in this morning is not back.
    expect(blockChase(out("2026-09-01"), on("2026-09-01")).urgency).toBe("quiet");
    expect(blockChase(out("2026-09-01"), on("2026-09-02")).urgency).toBe("quiet");
  });

  it("reminds daily from day two out", () => {
    const chase = blockChase(out("2026-09-01"), on("2026-09-03"));
    expect(chase.urgency).toBe("remind");
    expect(chase.daysOut).toBe(REMIND_FROM_DAYS);
  });

  it("escalates from day four out", () => {
    const chase = blockChase(out("2026-09-01"), on("2026-09-05"));
    expect(chase.urgency).toBe("escalate");
    expect(chase.daysOut).toBe(ESCALATE_FROM_DAYS);
  });

  it("is clocked from the day it went out, not from the estimate", () => {
    // The estimate is the thing being doubted. Measuring against a number that
    // may already be wrong is no measurement.
    const generous = blockChase(out("2026-09-01", "2026-12-01"), on("2026-09-05"));
    expect(generous.urgency, "a distant estimate must not silence the chase").toBe("escalate");
  });

  it("carries how long is left on the estimate, so a long job reads as under control", () => {
    // "Out 4 days, expected back in 6" is information. The same line without it
    // is a nag, and a nag is what gets ignored.
    const chase = blockChase(out("2026-09-01", "2026-09-11"), on("2026-09-05"));
    expect(chase.daysToExpected).toBe(6);
  });

  it("reports a passed estimate as negative days", () => {
    const chase = blockChase(out("2026-09-01", "2026-09-03"), on("2026-09-06"));
    expect(chase.daysToExpected).toBe(-3);
    expect(chase.urgency).toBe("escalate");
  });

  it("treats a block that has not started yet as quiet", () => {
    // Scheduled maintenance next week is not a car anyone has lost.
    expect(blockChase(out("2026-09-20"), on("2026-09-05")).daysOut).toBeLessThan(0);
    expect(blockChase(out("2026-09-20"), on("2026-09-05")).urgency).toBe("quiet");
  });
});

describe("the message shown to staff", () => {
  it("names each reason in words rather than the stored token", () => {
    for (const [reason, expected] of [
      ["maintenance", "is in maintenance"],
      ["damage", "off the road with damage"],
      ["hold", "is on hold"],
    ] as const) {
      expect(describeBlock(openBlock({ reason }))).toContain(expected);
    }
  });

  it("falls back to plain wording for a reason it does not know", () => {
    expect(describeBlock(openBlock({ reason: "something_new" }))).toContain("out of the fleet");
  });
});
