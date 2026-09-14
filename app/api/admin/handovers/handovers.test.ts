import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The counter's HTTP surface.
 *
 * These tests are about the *route's* job, which is deliberately small: read
 * the request, refuse what is malformed, choose which database function to
 * call, and turn its answer into an HTTP one. Whether the rules themselves are
 * right is settled against a real Postgres in lib/checkOutFinalisation.test.ts,
 * lib/checkInFinalisation.test.ts and lib/handoverCorrectionAndVoid.test.ts.
 *
 * That split is worth stating, because a mocked database can be made to agree
 * with anything. The value here is in the seams: that the direction comes from
 * the row and not the request, that a retry is answered with the same handover,
 * that a correction is refused without an administrator's header, and that a
 * refusal reaches the caller as its own words rather than a 500.
 */

const state = vi.hoisted(() => ({
  handover: null as Record<string, unknown> | null,
  handoverAfterUpdate: null as Record<string, unknown> | null,
  reservation: null as Record<string, unknown> | null,
  outHandover: null as Record<string, unknown> | null,
  activeTemplate: null as Record<string, unknown> | null,
  views: [] as Record<string, unknown>[],
  photos: [] as Record<string, unknown>[],
  list: [] as Record<string, unknown>[],
  inserted: null as Record<string, unknown> | null,
  insertError: null as { code: string; message: string } | null,
  updated: null as Record<string, unknown> | null,
  updateFilters: {} as Record<string, unknown>,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  rpcError: null as { code: string; message: string } | null,
  rpcResult: { ok: true } as unknown,
  user: { id: "staff-1", email: "maria@anadyon.gr", user_metadata: { full_name: "Maria" } } as
    | Record<string, unknown>
    | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

vi.mock("@/lib/supabase", () => {
  /** A chain that answers from `state` according to which table was asked. */
  const table = (name: string) => ({
    select: () => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.eq = (col: string, val: unknown) => { filters[col] = val; return chain; };
      for (const m of ["is", "not", "gte", "lte", "order", "limit"]) chain[m] = () => chain;

      const one = () => {
        if (name === "reservations") return { data: state.reservation, error: null };
        if (name === "inspection_templates") return { data: state.activeTemplate, error: null };
        if (name === "rental_handovers") {
          // The "did a completed check-out exist" lookup, distinguished by the
          // filters the route actually applies rather than by call order.
          if (filters.direction === "out" && filters.status === "completed") {
            return { data: state.outHandover, error: null };
          }
          return { data: state.handover, error: null };
        }
        return { data: null, error: null };
      };
      chain.maybeSingle = async () => one();
      chain.single = async () => one();
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (name === "inspection_template_views") return resolve({ data: state.views, error: null });
        if (name === "handover_photos") return resolve({ data: state.photos, error: null });
        if (name === "rental_handovers") return resolve({ data: state.list, error: null });
        return resolve({ data: [], error: null });
      };
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      state.inserted = payload;
      return {
        select: () => ({
          single: async () =>
            state.insertError
              ? { data: null, error: state.insertError }
              : { data: { id: "new-handover", ...payload }, error: null },
        }),
      };
    },
    update: (payload: Record<string, unknown>) => {
      state.updated = payload;
      state.updateFilters = {};
      const chain: Record<string, unknown> = {};
      // Filters are recorded, not ignored. A mock that swallowed them would let
      // a route drop `.eq("status", "draft")` and still pass every test here,
      // which is the scoping that stops an unaudited edit to a completed record.
      chain.eq = (col: string, val: unknown) => { state.updateFilters[col] = val; return chain; };
      chain.is = () => chain;
      chain.select = () => ({
        maybeSingle: async () => ({ data: state.handoverAfterUpdate, error: null }),
        single: async () => ({ data: state.handoverAfterUpdate, error: null }),
      });
      return chain;
    },
  });

  return {
    supabaseAdmin: {
      from: table,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpc.push({ fn, args });
        return state.rpcError
          ? { data: null, error: state.rpcError }
          : { data: state.rpcResult, error: null };
      },
    },
  };
});

const { GET: listGet, POST: openPost } = await import("./route");
const { GET: oneGet, PATCH: draftPatch } = await import("./[id]/route");
const { POST: finalisePost } = await import("./[id]/finalise/route");
const { POST: voidPost } = await import("./[id]/void/route");
const { PATCH: correctPatch } = await import("./[id]/correct/route");

const HANDOVER = "ffffffff-0000-4000-8000-000000000001";
const RESERVATION = "dddddddd-0000-4000-8000-000000000001";
const OPERATION = "aaaaaaaa-0000-4000-8000-0000000000aa";
const VEHICLE = "bbbbbbbb-0000-4000-8000-000000000001";
const TEMPLATE = "eeeeeeee-0000-4000-8000-000000000001";

const params = (id = HANDOVER) => ({ params: Promise.resolve({ id }) });

const request = (url: string, init: RequestInit = {}) =>
  new Request(url, {
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  }) as NextRequest;

const jsonBody = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers,
});

beforeEach(() => {
  state.handover = { id: HANDOVER, direction: "out", status: "draft", inspection_template_id: TEMPLATE };
  state.handoverAfterUpdate = { id: HANDOVER, status: "draft" };
  state.reservation = { id: RESERVATION, vehicle_id: VEHICLE, vehicles: { category: "car" } };
  state.outHandover = null;
  state.activeTemplate = { id: TEMPLATE };
  state.views = [];
  state.photos = [];
  state.list = [];
  state.inserted = null;
  state.insertError = null;
  state.updated = null;
  state.updateFilters = {};
  state.rpc = [];
  state.rpcError = null;
  state.rpcResult = { ok: true };
  state.user = { id: "staff-1", email: "maria@anadyon.gr", user_metadata: { full_name: "Maria" } };
});

describe("opening a handover", () => {
  it("refuses a request that does not name a reservation, a direction and an operation", async () => {
    const bad = [
      { direction: "out", client_operation_id: OPERATION },
      { reservation_id: RESERVATION, direction: "sideways", client_operation_id: OPERATION },
      { reservation_id: RESERVATION, direction: "out" },
    ];
    for (const body of bad) {
      const res = await openPost(request("http://localhost/api/admin/handovers", jsonBody(body)));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("requires the tablet to supply the operation id rather than inventing one", async () => {
    // If the server generated it, every retry would be a new operation and the
    // idempotency this exists for would be gone.
    const res = await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: "not-a-uuid" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/client operation id is required/i);
  });

  it("hands back the existing handover when the same operation is submitted again", async () => {
    state.handover = { id: HANDOVER, status: "draft" };
    const res = await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION })));
    const body = await res.json();
    expect(body.resumed).toBe(true);
    expect(body.handover.id).toBe(HANDOVER);
    expect(state.inserted).toBeNull();
  });

  it("takes the vehicle from the reservation, never from the request", async () => {
    // A tablet that could name its own vehicle could file a handover against a
    // car it never saw.
    state.handover = null;
    await openPost(request("http://localhost/api/admin/handovers", jsonBody({
      reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION,
      vehicle_id: "bbbbbbbb-0000-4000-8000-00000000dead",
    })));
    expect(state.inserted?.vehicle_id).toBe(VEHICLE);
  });

  it("refuses to open one on a reservation with no vehicle assigned", async () => {
    state.handover = null;
    state.reservation = { id: RESERVATION, vehicle_id: null, vehicles: null };
    const res = await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION })));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/assign a vehicle/i);
  });

  it("says so when no active template exists for the category", async () => {
    state.handover = null;
    state.activeTemplate = null;
    const res = await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION })));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no active inspection template exists for car/i);
  });

  it("gives an inbound handover the outbound one's template, not today's active one", async () => {
    // §4.2: both handovers for one rental use the same template version. The
    // active template may have been superseded during the rental, and migration
    // 042 refuses the mismatch — this is what stops it arising.
    state.handover = null;
    state.outHandover = { inspection_template_id: "eeeeeeee-0000-4000-8000-0000000000ff" };
    state.activeTemplate = { id: TEMPLATE };
    await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "in", client_operation_id: OPERATION })));
    expect(state.inserted?.inspection_template_id).toBe("eeeeeeee-0000-4000-8000-0000000000ff");
  });

  it("falls back to the active template for an inbound handover with no completed check-out", async () => {
    // The database refuses that finalisation anyway; opening the draft is not
    // where to stop them, and refusing here would hide the real reason.
    state.handover = null;
    state.outHandover = null;
    await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "in", client_operation_id: OPERATION })));
    expect(state.inserted?.inspection_template_id).toBe(TEMPLATE);
  });

  it("answers a race with the row that won rather than with the collision", async () => {
    state.handover = null;
    state.insertError = { code: "23505", message: "duplicate key" };
    // The post-collision lookup finds it.
    const original = state.handover;
    state.handover = original;
    const res = await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION })));
    // With nothing to find, the conflict is reported honestly rather than as a 500.
    expect(res.status).toBe(409);
  });

  it("records who opened it", async () => {
    state.handover = null;
    await openPost(request("http://localhost/api/admin/handovers",
      jsonBody({ reservation_id: RESERVATION, direction: "out", client_operation_id: OPERATION })));
    expect(state.inserted?.created_by).toBe("staff-1");
  });
});

describe("listing a rental's handovers", () => {
  it("requires a reservation", async () => {
    const res = await listGet(request("http://localhost/api/admin/handovers"));
    expect(res.status).toBe(400);
  });

  it("refuses an id that is not one", async () => {
    const res = await listGet(request("http://localhost/api/admin/handovers?reservation_id=drop-table"));
    expect(res.status).toBe(400);
  });
});

describe("reading one handover", () => {
  it("says which required views still have no photograph", async () => {
    // Computed server-side because it is the same question the database asks at
    // finalisation, and two implementations of one rule is how a screen comes
    // to say "ready" about a handover the server then refuses.
    state.views = [
      { id: "v-front", required: true },
      { id: "v-rear", required: true },
      { id: "v-boot", required: false },
    ];
    state.photos = [{ template_view_id: "v-front" }];

    const res = await oneGet(request("http://localhost/api/admin/handovers/x"), params());
    const body = await res.json();
    expect(body.outstanding_required_views).toEqual(["v-rear"]);
  });

  it("does not count an optional view as outstanding", async () => {
    state.views = [{ id: "v-boot", required: false }];
    state.photos = [];
    const res = await oneGet(request("http://localhost/api/admin/handovers/x"), params());
    expect((await res.json()).outstanding_required_views).toEqual([]);
  });

  it("answers 404 for an id that is not a uuid", async () => {
    const res = await oneGet(request("http://localhost/api/admin/handovers/x"), params("nonsense"));
    expect(res.status).toBe(404);
  });
});

describe("recording what is on the car", () => {
  const patch = (body: unknown) =>
    draftPatch(request("http://localhost/api/admin/handovers/x", {
      method: "PATCH", body: JSON.stringify(body),
    }), params());

  it("refuses values the column could not hold", async () => {
    for (const body of [
      { odometer_km: -1 },
      { odometer_km: 12.5 },
      { fuel_eighths: 9 },
      { fuel_eighths: -1 },
      { cleanliness: "filthy" },
      { notes: 42 },
      { occurred_at: "not a time" },
    ]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses an occurrence in the future", async () => {
    const res = await patch({ occurred_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot have occurred in the future/i);
  });

  it("scopes the update to drafts in the statement itself", async () => {
    // Not a read-then-write: that leaves a window in which a finalisation lands
    // between the two, and this update would then quietly edit a completed
    // record — an unaudited correction wearing the wrong verb.
    await patch({ odometer_km: 41500 });
    expect(state.updateFilters).toMatchObject({ id: HANDOVER, status: "draft" });
  });

  it("changes only what was sent", async () => {
    // A tablet saving the odometer must not clear the note it saved a moment
    // ago, which is what a full-object PATCH would do.
    await patch({ odometer_km: 41500 });
    expect(state.updated).toEqual({ odometer_km: 41500 });
  });

  it("allows a field to be cleared deliberately", async () => {
    await patch({ fuel_eighths: null });
    expect(state.updated).toEqual({ fuel_eighths: null });
  });

  it("refuses a patch that changes nothing", async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
  });

  it("tells a colleague their handover was finalised while they typed", async () => {
    // The update is scoped to drafts in the statement, so it matches nothing;
    // the row still exists, and "not found" would be the wrong word for it.
    state.handoverAfterUpdate = null;
    state.handover = { id: HANDOVER, status: "completed" };
    const res = await patch({ odometer_km: 41500 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/is completed\. Reload/i);
  });

  it("says not found when the handover really is gone", async () => {
    state.handoverAfterUpdate = null;
    state.handover = null;
    const res = await patch({ odometer_km: 41500 });
    expect(res.status).toBe(404);
  });
});

describe("finalising", () => {
  const finalise = (body: unknown = {}) =>
    finalisePost(request("http://localhost/api/admin/handovers/x/finalise", jsonBody(body)), params());

  it("chooses the function from the row's direction, not from the request", async () => {
    state.handover = { id: HANDOVER, direction: "in" };
    await finalise({ direction: "out" });
    expect(state.rpc[0].fn).toBe("finalise_check_in_impl");
  });

  it("calls the check-out function for an outbound handover", async () => {
    state.handover = { id: HANDOVER, direction: "out" };
    await finalise();
    expect(state.rpc[0].fn).toBe("finalise_check_out_impl");
  });

  it("passes the actor and the name snapshot from the session", async () => {
    await finalise();
    expect(state.rpc[0].args.p_actor).toBe("staff-1");
    expect(state.rpc[0].args.p_actor_name).toBe("Maria");
  });

  it("falls back to the email when no display name is set", async () => {
    state.user = { id: "staff-1", email: "maria@anadyon.gr", user_metadata: {} };
    await finalise();
    expect(state.rpc[0].args.p_actor_name).toBe("maria@anadyon.gr");
  });

  it("refuses rather than finalising with no actor", async () => {
    state.user = null;
    const res = await finalise();
    expect(res.status).toBe(401);
    expect(state.rpc).toHaveLength(0);
  });

  it("passes a stated earlier occurrence through, and refuses a future one", async () => {
    const earlier = new Date(Date.now() - 3_600_000).toISOString();
    await finalise({ occurred_at: earlier });
    expect(state.rpc[0].args.p_occurred_at).toBe(earlier);

    const res = await finalise({ occurred_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.status).toBe(400);
  });

  it("gives the refusal back in the words the database chose", async () => {
    state.rpcError = {
      code: "AN422",
      message: "check-out refused: vehicle is marked maintenance; 2 required photograph(s) are missing",
    };
    const res = await finalise();
    expect(res.status).toBe(422);
    expect((await res.json()).error)
      .toBe("vehicle is marked maintenance; 2 required photograph(s) are missing");
  });

  it("answers 404 for a handover that does not exist", async () => {
    state.handover = null;
    const res = await finalise();
    expect(res.status).toBe(404);
    expect(state.rpc).toHaveLength(0);
  });
});

describe("voiding", () => {
  const doVoid = (body: unknown) =>
    voidPost(request("http://localhost/api/admin/handovers/x/void", jsonBody(body)), params());

  it("requires a reason, and says so in words a person can act on", async () => {
    const res = await doVoid({ reason: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/say why/i);
    expect(state.rpc).toHaveLength(0);
  });

  it("passes the trimmed reason and the actor through", async () => {
    await doVoid({ reason: "  started on the wrong car  " });
    expect(state.rpc[0].fn).toBe("void_handover_impl");
    expect(state.rpc[0].args.p_reason).toBe("started on the wrong car");
    expect(state.rpc[0].args.p_actor).toBe("staff-1");
  });

  it("is available without an administrator header", async () => {
    // The wrong car on a handover is a counter mistake, and a fix only an
    // administrator can perform is a fix that waits with a customer standing
    // there.
    const res = await doVoid({ reason: "wrong car" });
    expect(res.status).toBe(200);
  });
});

describe("correcting", () => {
  const correct = (body: unknown, role = "admin") =>
    correctPatch(request("http://localhost/api/admin/handovers/x/correct", {
      method: "PATCH", body: JSON.stringify(body), headers: { "x-anadyon-role": role },
    }), params());

  it("refuses anyone who is not an administrator", async () => {
    // proxy.ts admits staff to /api/admin/handovers by prefix, so this route is
    // where the exception is enforced — the same shape as the vehicle ledger.
    const res = await correct({ reason: "typo", changes: { odometer_km: 41550 } }, "staff");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/requires an administrator/i);
    expect(state.rpc).toHaveLength(0);
  });

  it("refuses a request carrying no role at all", async () => {
    const res = await correct({ reason: "typo", changes: { odometer_km: 41550 } }, "");
    expect(res.status).toBe(403);
  });

  it("requires a reason", async () => {
    const res = await correct({ changes: { odometer_km: 41550 } });
    expect(res.status).toBe(400);
    expect(state.rpc).toHaveLength(0);
  });

  it("refuses a field that is not an observation, and names it", async () => {
    const res = await correct({ reason: "wrong car", changes: { vehicle_id: VEHICLE } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/vehicle_id/);
    expect(body.error).toMatch(/void it and record a new one/i);
    expect(state.rpc).toHaveLength(0);
  });

  it("checks the shape of a value but leaves the meaning to the database", async () => {
    // 9 eighths is a shape error and is caught here. An odometer below the
    // check-out reading is a *meaning* error, needs the other handover and a
    // lock, and is left to handover_state_blockers().
    expect((await correct({ reason: "typo", changes: { fuel_eighths: 9 } })).status).toBe(400);

    state.rpc = [];
    await correct({ reason: "typo", changes: { odometer_km: 1 } });
    expect(state.rpc[0].fn).toBe("correct_handover_impl");
  });

  it("passes the reason and the changes through unchanged", async () => {
    await correct({ reason: "odometer misread", changes: { odometer_km: 41550, notes: "in the sun" } });
    expect(state.rpc[0].args.p_reason).toBe("odometer misread");
    expect(state.rpc[0].args.p_changes).toEqual({ odometer_km: 41550, notes: "in the sun" });
  });

  it("gives the database's refusal back verbatim", async () => {
    state.rpcError = {
      code: "AN422",
      message: "correction refused: the odometer would read 41100, lower than the 41200 recorded at check-out",
    };
    const res = await correct({ reason: "typo", changes: { odometer_km: 41100 } });
    expect(res.status).toBe(422);
    expect((await res.json()).error)
      .toBe("the odometer would read 41100, lower than the 41200 recorded at check-out");
  });
});
