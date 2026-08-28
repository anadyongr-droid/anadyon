import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The driver half of the phase-1 safety kernel.
 *
 * licenceStatus has returned blocks:true for an expiry falling before the
 * return since it was written, and nothing ever acted on it: the Today screen
 * and the reservation modal both only *display* it. Staff could read "the
 * driver would be uninsured for part of the rental" and save anyway, leaving no
 * record that anybody had seen it.
 */
const mocks = vi.hoisted(() => ({
  result: {
    data: null as { driving_licence_number: string | null; driving_licence_expiry: string | null } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.maybeSingle = async () => mocks.result;
  return { supabaseAdmin: { from: () => chain } };
});

const { licenceGate } = await import("./licenceGate");

const RENTAL = ["customer-1", "2026-09-14", "09:00"] as const;
const licence = (expiry: string | null) => ({ driving_licence_number: "GR1234", driving_licence_expiry: expiry });

beforeEach(() => { mocks.result.data = null; mocks.result.error = null; });

describe("saving a reservation whose driver's licence expires too soon", () => {
  it("refuses when the licence expires before the vehicle is due back", async () => {
    mocks.result.data = licence("2026-09-10");   // rental returns the 14th
    const { problem } = await licenceGate(...RENTAL, false);
    expect(problem).toContain("uninsured");
    expect(problem).toContain("Confirm the licence has been checked");
  });

  it("permits a licence valid past the return", async () => {
    mocks.result.data = licence("2027-05-01");
    expect((await licenceGate(...RENTAL, false)).problem).toBeNull();
  });

  it("measures against the RETURN, not the pick-up", async () => {
    // The customer drives on the last day too. A licence valid at collection
    // and expired by the return leaves them uninsured for part of the hire —
    // which is the whole reason licenceStatus takes the return instant.
    mocks.result.data = licence("2026-09-12");
    expect((await licenceGate("customer-1", "2026-09-14", "09:00", false)).problem).not.toBeNull();
    expect((await licenceGate("customer-1", "2026-09-11", "09:00", false)).problem).toBeNull();
  });

  it("lets staff proceed on attestation, and says it overrode something", async () => {
    // Not a hard refusal: a licence expiring next month can be renewed before a
    // pick-up in three weeks, and refusing outright turns away real bookings.
    // What it refuses is proceeding *silently*.
    mocks.result.data = licence("2026-09-10");
    const result = await licenceGate(...RENTAL, true);
    expect(result.problem).toBeNull();
    expect(result.overridden).toBe(true);
  });

  it("does not report an override when nothing was blocked", async () => {
    // Otherwise every save by a member of staff who ticks the box out of habit
    // would write an attestation note onto a reservation that never needed one.
    mocks.result.data = licence("2027-05-01");
    expect((await licenceGate(...RENTAL, true)).overridden).toBe(false);
  });

  it("FAILS CLOSED when the customer record cannot be read", async () => {
    // §5.3: "cannot reach the database" must never look like "nothing found".
    // Here the two differ by whether an uninsured driver is handed the keys.
    mocks.result.error = { message: "connection terminated" };
    const { problem } = await licenceGate(...RENTAL, false);
    expect(problem, "an unreadable check must refuse, not permit").not.toBeNull();
    expect(problem).toContain("not saved");
  });

  it("does not block a reservation with no linked customer or no return date", async () => {
    // A walk-in typed straight onto the calendar has no customer row yet, and
    // licenceStatus reports "missing" rather than blocking. Refusing here would
    // stop staff creating a booking at all.
    expect((await licenceGate(null, "2026-09-14", "09:00", false)).problem).toBeNull();
    expect((await licenceGate("customer-1", "", "09:00", false)).problem).toBeNull();
  });

  it("does not block when the customer has no licence recorded", async () => {
    // "Not recorded" is not "expired" — the same distinction the statutory gate
    // makes for KTEO. It is a gap to chase at the counter, not a refusal here.
    mocks.result.data = licence(null);
    expect((await licenceGate(...RENTAL, false)).problem).toBeNull();
  });
});
