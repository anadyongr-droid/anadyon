import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * W25, from the §5.3 audit: this route awaited Twilio bare.
 *
 * A send failure was an unhandled rejection — a framework 500 whose body is
 * HTML, which the admin's own `res.json()` then threw on, leaving the button on
 * "Sending…" for ever and nothing anywhere saying the message had not gone.
 *
 * These tests are about that path. The happy path is covered too, but only so
 * the failure cases are not passing for the wrong reason.
 */

const create = vi.fn();
const requestClient = vi.fn();

vi.mock("twilio", () => {
  const twilio = vi.fn(() => ({ messages: { create: (...a: unknown[]) => create(...a) } }));
  // The SDK exposes RequestClient on the default export; the route constructs
  // one to carry the timeout.
  (twilio as unknown as { RequestClient: unknown }).RequestClient = function (opts: unknown) {
    requestClient(opts);
  };
  return { default: twilio };
});

let reservation: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: reservation, error: reservation ? null : "missing" }) }),
      }),
    }),
  },
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// A well-formed v4 UUID. An earlier draft used one whose variant nibble was
// invalid, so zod rejected every request with a 400 and six tests failed for a
// reason that had nothing to do with what they were testing.
const RESERVATION_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = "sid";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+30000000000";
  reservation = {
    customer_name: "A Customer",
    customer_phone: "+306900000000",
    pickup_date: "2026-10-10",
    return_date: "2026-10-13",
    status: "confirmed",
    deposit_paid_at: "2026-10-01T00:00:00Z",
  };
  create.mockResolvedValue({ sid: "SM123" });
});

describe("a Twilio failure is answered, not thrown", () => {
  it("returns 502 and says the customer did not get it", async () => {
    create.mockRejectedValue(new Error("21608 unverified number"));

    const response = await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));

    expect(response.status).toBe(502);
    const body = await response.json();
    // The operator's question is "did it go?", so the answer has to say so in
    // words rather than leaving it to be inferred from a status code.
    expect(body.error).toContain("Not sent");
    expect(body.error).toContain("has not received");
    expect(body.error).toContain("21608 unverified number");
  });

  it("answers with JSON, which is what the caller parses", async () => {
    // The admin does `res.json()`. An unhandled rejection returns HTML and
    // makes that throw in turn — the second half of the original defect.
    create.mockRejectedValue(new Error("boom"));
    const response = await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toBeTruthy();
  });

  it("survives a rejection that is not an Error", async () => {
    create.mockRejectedValue("just a string");
    const response = await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("did not respond");
  });
});

describe("the call is bounded", () => {
  it("builds the client with a timeout", async () => {
    // §5.3: every external call carries a timeout. This one carried none, and
    // an unbounded call is what took the admin down in August.
    await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));
    expect(requestClient).toHaveBeenCalledTimes(1);
    const opts = requestClient.mock.calls[0][0] as { timeout?: number };
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.timeout).toBeLessThanOrEqual(10_000);
  });
});

describe("what it still refuses, unchanged by this fix", () => {
  it("sends on the happy path", async () => {
    const body = await (await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }))).json();
    expect(body).toEqual({ ok: true, sid: "SM123" });
  });

  it("refuses a confirmation before payment is verified", async () => {
    reservation = { ...reservation, deposit_paid_at: null };
    const response = await POST(request({ reservationId: RESERVATION_ID, template: "confirmation" }));
    expect(response.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses when there is no phone number on file", async () => {
    reservation = { ...reservation, customer_phone: null };
    const response = await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses when Twilio is not configured, without calling out", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const response = await POST(request({ reservationId: RESERVATION_ID, template: "pickup_reminder" }));
    expect(response.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const response = await POST(request({ reservationId: "not-a-uuid", template: "pickup_reminder" }));
    expect(response.status).toBe(400);
  });
});
