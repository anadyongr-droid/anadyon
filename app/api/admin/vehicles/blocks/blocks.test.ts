import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Taking a vehicle out of the active fleet, and putting it back.
 *
 * Blueprint §7.4. Two rules carry the design and both are asserted here:
 * an expected return ends nothing, and a vehicle that has actually been out is
 * RELEASED rather than deleted — erasing it would remove the record of the car
 * having been off the road, which is the one thing this table exists to keep.
 */
const state = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  deleted: [] as string[],
  existingBlock: null as Record<string, unknown> | null,
  reservations: [] as Record<string, unknown>[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

vi.mock("@/lib/supabase", () => {
  const table = (name: string) => ({
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "is", "not", "gte", "lte", "order"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: state.existingBlock, error: null });
      chain.single = async () => ({ data: state.existingBlock, error: null });
      chain.then = (r: (v: unknown) => unknown) =>
        r({ data: name === "reservations" ? state.reservations : [], error: null });
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      state.inserted = payload;
      return { select: () => ({ single: async () => ({ data: { id: "block-1", ...payload }, error: null }) }) };
    },
    update: (payload: Record<string, unknown>) => {
      state.updated = payload;
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "is"]) chain[m] = () => chain;
      chain.select = () => ({ single: async () => ({ data: { id: "block-1", ...payload }, error: null }) });
      return chain;
    },
    delete: () => ({ eq: (_c: string, id: string) => { state.deleted.push(id); return Promise.resolve({ error: null }); } }),
  });
  return { supabaseAdmin: { from: table } };
});

const { POST, PATCH, DELETE } = await import("./route");

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/admin/vehicles/blocks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) as NextRequest);

const valid = { vehicle_id: "v1", reason: "maintenance", starts_on: "2026-09-01", expected_return: "2026-09-12" };

beforeEach(() => {
  state.inserted = null; state.updated = null; state.deleted = [];
  state.existingBlock = null; state.reservations = [];
});

describe("taking a vehicle out", () => {
  it("records who took it out, from their own session", async () => {
    // Application-asserted rather than auth.uid(), which is NULL under the
    // service role — see docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md.
    await post(valid);
    expect(state.inserted).toMatchObject({ vehicle_id: "v1", reason: "maintenance", created_by: "staff-1" });
  });

  it("NEVER writes a released_at on creation", async () => {
    // The whole design: a block is open until a person closes it. A default or
    // a computed end date here would reintroduce the failure it exists to stop.
    await post(valid);
    expect(state.inserted).not.toHaveProperty("released_at");
  });

  it("reports the bookings the block does not cancel", async () => {
    // A block stops NEW allocation only. Existing reservations sit quietly
    // until the customer arrives, so they are surfaced at the moment the
    // decision is made rather than on the day it bites.
    state.reservations = [
      { id: "r1", customer_name: "A", customer_phone: "690", pickup_date: "2026-09-03", return_date: "2026-09-06" },
      { id: "r2", customer_name: "B", customer_phone: "691", pickup_date: "2026-09-08", return_date: "2026-09-10" },
    ];
    const body = await (await post(valid)).json();
    expect(body.covered_reservations).toHaveLength(2);
    expect(body.covered_reservations[0]).toMatchObject({ customer_name: "A", customer_phone: "690" });
  });

  it("refuses an expected return that precedes the day it went out", async () => {
    const res = await post({ ...valid, expected_return: "2026-08-20" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot precede/i);
  });

  it("refuses a reason outside the closed set", async () => {
    // Free text becomes eleven spellings of "service" and nothing reports.
    expect((await post({ ...valid, reason: "in the shop" })).status).toBe(400);
  });

  it("refuses a missing or malformed start date", async () => {
    expect((await post({ ...valid, starts_on: "" })).status).toBe(400);
    expect((await post({ ...valid, starts_on: "2026-9-1" })).status).toBe(400);
  });

  it("accepts a block with no estimated return at all", async () => {
    // Damage with no known end is the normal case, not an edge one.
    const res = await post({ ...valid, expected_return: "" });
    expect(res.status).toBe(201);
    expect(state.inserted).toMatchObject({ expected_return: null });
  });
});

describe("putting it back", () => {
  const patch = (id: string) => PATCH(new Request("http://localhost/api/admin/vehicles/blocks", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
  }) as NextRequest);

  it("stamps who recorded it back, and when", async () => {
    state.existingBlock = { id: "block-1", released_at: null };
    await patch("block-1");
    expect(state.updated).toMatchObject({ released_by: "staff-1" });
    expect(state.updated?.released_at).toBeTruthy();
  });

  it("treats a second press as done rather than as an error", async () => {
    // Two people pressing the same button is how this actually gets used.
    state.existingBlock = { id: "block-1", released_at: "2026-09-12T10:00:00Z" };
    const res = await patch("block-1");
    expect(res.status).toBe(200);
    expect((await res.json()).already_released).toBe(true);
    expect(state.updated, "must not overwrite the original release").toBeNull();
  });
});

describe("deleting a block", () => {
  const del = (id: string) => DELETE(
    new Request(`http://localhost/api/admin/vehicles/blocks?id=${id}`, { method: "DELETE" }) as NextRequest);

  it("REFUSES once the vehicle has actually been out", async () => {
    // This is how a hard stop gets worked around: delete the block, and the
    // record of the car having been off the road goes with it. The door is
    // shut here rather than by hoping nobody tries.
    state.existingBlock = { id: "block-1", starts_on: "2020-01-01", released_at: null };
    const res = await del("block-1");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/record it back/i);
    expect(state.deleted).toHaveLength(0);
  });

  it("allows cancelling one that has not started yet", async () => {
    // A service booked for next week that the garage cancelled never happened,
    // and there is nothing to preserve.
    state.existingBlock = { id: "block-1", starts_on: "2099-01-01", released_at: null };
    expect((await del("block-1")).status).toBe(200);
    expect(state.deleted).toEqual(["block-1"]);
  });
});
