import { describe, it, expect, vi, beforeEach } from "vitest";

// Captures whatever reaches Postgres, which is the whole point: the cancellation
// bug was a non-column field being passed straight through to `.update()`.
let updatePayload: Record<string, unknown> | null = null;
let insertPayload: Record<string, unknown> | null = null;
let inserted: Record<string, unknown> = {};
const sentEmails: { subject: string }[] = [];
const emailClaims = new Set<string>();

vi.mock("@/lib/supabase", () => {
  const result = (row: Record<string, unknown>) => ({
    select: () => ({ single: async () => ({ data: row, error: null }) }),
  });
  const table = (name: string) => ({
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "not", "lt", "gt", "gte", "lte", "ilike", "order"]) {
        chain[m] = () => chain;
      }
      chain.single = async () => ({ data: { ...inserted }, error: null });
      // PATCH now reads the existing provenance before updating. Returning the
      // current fixture keeps this mock faithful to Supabase's maybeSingle()
      // behaviour without making unrelated status/email tests depend on an
      // actual quote allocation.
      chain.maybeSingle = async () => ({ data: { ...inserted }, error: null });
      chain.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      if (name === "alert_outbox") {
        const key = String(payload.key);
        if (emailClaims.has(key)) return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
        emailClaims.add(key);
        return Promise.resolve({ error: null });
      }
      insertPayload = payload;
      inserted = { ...payload, id: "res-1", vehicles: { name: "Fiat Panda" } };
      return result(inserted);
    },
    update: (payload: Record<string, unknown>) => {
      if (name === "alert_outbox") return { eq: async () => ({ error: null }) };
      if (name === "reservations") updatePayload = payload;
      const row = { ...inserted, ...payload };
      inserted = row;
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.select = () => chain;
      chain.single = async () => ({ data: row, error: null });
      chain.maybeSingle = async () => ({ data: row, error: null });
      chain.then = (r: (v: unknown) => unknown) => r({ data: [row], error: null });
      return chain;
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
  });
  return { supabaseAdmin: { from: (name: string) => table(name) } };
});

vi.mock("@/lib/mailer", () => ({
  sendMail: async (m: { subject: string }) => { sentEmails.push(m); return { ok: true, queued: false }; },
  mailIsRedirected: false,
}));

const { PATCH } = await import("./[id]/route");
const { POST } = await import("./route");

const req = (body: unknown) =>
  new Request("http://localhost/api/admin/reservations/res-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const params = { params: Promise.resolve({ id: "res-1" }) };

beforeEach(() => {
  updatePayload = null;
  insertPayload = null;
  inserted = { id: "res-1", status: "confirmed", deposit_paid_at: "2026-08-23T09:00:00Z", customer_email: "a@b.gr" };
  sentEmails.length = 0;
  emailClaims.clear();
});

describe("PATCH /api/admin/reservations/[id]", () => {
  it("never forwards the UI-only _prev_status to the database", async () => {
    // The live failure was: Could not find the '_prev_status' column of
    // 'reservations' in the schema cache — a 400 that made every edit, including
    // every cancellation, silently fail.
    const res = await PATCH(req({ status: "cancelled", _prev_status: "confirmed" }), params);
    expect(res.status).toBe(200);
    expect(updatePayload).not.toHaveProperty("_prev_status");
    expect(updatePayload).toMatchObject({ status: "cancelled" });
  });

  it("confirms and emails only after staff explicitly verifies payment", async () => {
    inserted = {
      id: "res-1", status: "pending", deposit_paid_at: null,
      customer_name: "Alex Customer", customer_email: "a@b.gr",
      pickup_date: "2026-08-25", pickup_time: "09:00", pickup_location: "Zakynthos Airport",
      return_date: "2026-08-28", return_time: "09:00",
      total: 100, deposit: 30, balance_due: 70, notes: "Quote ref: TEST01",
      vehicles: { name: "Fiat Panda" },
    };
    const response = await PATCH(req({ status: "confirmed", _prev_status: "pending", _payment_verified: true, _payment_amount: 30 }), params);
    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ status: "confirmed" });
    expect(typeof updatePayload!.deposit_paid_at).toBe("string");
    expect(sentEmails.map((e) => e.subject)).toContain("Booking confirmed — TEST01");
  });

  it("sets the outstanding balance to zero when staff verifies full payment", async () => {
    inserted = {
      id: "res-1", status: "pending", deposit_paid_at: null,
      customer_name: "Alex Customer", customer_email: "a@b.gr",
      pickup_date: "2026-08-25", pickup_time: "09:00", pickup_location: "Zakynthos Airport",
      return_date: "2026-08-28", return_time: "09:00",
      total: 100, deposit: 30, balance_due: 70, notes: "Quote ref: TEST01",
      vehicles: { name: "Fiat Panda" },
    };
    const response = await PATCH(req({
      status: "confirmed",
      _payment_verified: true,
      _payment_amount: 100,
    }), params);
    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ status: "confirmed", balance_due: 0 });
    expect((await response.json()).balance_due).toBe(0);
  });

  it("refuses to confirm a pending booking without verified payment", async () => {
    inserted = { id: "res-1", status: "pending", deposit_paid_at: null, customer_email: "a@b.gr" };
    const response = await PATCH(req({ status: "confirmed", _prev_status: "pending" }), params);
    expect(response.status).toBe(400);
    expect(updatePayload).toBeNull();
    expect(sentEmails).toHaveLength(0);
  });

  it("sends no customer email when the status has not changed", async () => {
    await PATCH(req({ status: "confirmed", _prev_status: "confirmed" }), params);
    expect(sentEmails).toHaveLength(0);
  });

  it("sends no customer email on cancellation", async () => {
    // Cancelling must not reach for the confirmed/active templates.
    inserted = { id: "res-1", status: "cancelled", customer_email: "a@b.gr" };
    await PATCH(req({ status: "cancelled", _prev_status: "confirmed" }), params);
    expect(sentEmails).toHaveLength(0);
  });

  it("turns an empty date string into null rather than letting Postgres reject it", async () => {
    await PATCH(req({ customer_dob: "", status: "confirmed" }), params);
    expect(updatePayload!.customer_dob).toBeNull();
  });

  it("strips every underscore-prefixed field, not just the ones we thought of", async () => {
    // The rule, rather than a list. `_prev_status` broke every reservation edit
    // for weeks; `_daily_rate_override` would have done exactly the same the day
    // the counter-price feature shipped. Anything the form prefixes with an
    // underscore is its own state and is not a column.
    await PATCH(req({
      status: "confirmed",
      _prev_status: "pending",
      _daily_rate_override: "50",
      _some_future_ui_field: "whatever",
      _payment_verified: true,
      _payment_amount: 30,
    }), params);
    for (const key of Object.keys(updatePayload!)) {
      expect(key.startsWith("_"), `"${key}" reached the database`).toBe(false);
    }
    expect(updatePayload).toMatchObject({ status: "confirmed" });
  });

  it("never lets the client overwrite id or created_at", async () => {
    await PATCH(req({ id: "someone-elses-id", created_at: "1999-01-01", status: "confirmed" }), params);
    expect(updatePayload).not.toHaveProperty("id");
    expect(updatePayload).not.toHaveProperty("created_at");
  });

  it("always stamps updated_at, so a saved edit is visible as one", async () => {
    await PATCH(req({ status: "cancelled", _prev_status: "confirmed" }), params);
    expect(typeof updatePayload!.updated_at).toBe("string");
  });
});

describe("POST /api/admin/reservations", () => {
  const postReq = (body: unknown) =>
    new Request("http://localhost/api/admin/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("announces a genuinely new reservation to the office", async () => {
    await POST(postReq({ status: "pending", total: 100, customer_name: "A B" }));
    expect(sentEmails.some((e) => e.subject.startsWith("New Reservation"))).toBe(true);
    expect(insertPayload).toMatchObject({ source: "admin" });
  });

  it("refuses to create a confirmed booking without verified payment", async () => {
    const response = await POST(postReq({ status: "confirmed", total: 100, customer_name: "A B" }));
    expect(response.status).toBe(400);
    expect(insertPayload).toBeNull();
  });

  it("derives website source from a linked quote instead of trusting the client", async () => {
    await POST(postReq({ status: "pending", total: 100, customer_name: "A B", quote_id: "quote-1", source: "admin" }));
    expect(insertPayload).toMatchObject({ quote_id: "quote-1", source: "website" });
  });

  it("does not announce a cancelled reservation as a new one", async () => {
    // This is what the office actually saw: cancellations arriving as bookings.
    await POST(postReq({ status: "cancelled", total: 100, customer_name: "A B" }));
    expect(sentEmails).toHaveLength(0);
    expect(insertPayload).toMatchObject({ status: "cancelled" });
  });
});
