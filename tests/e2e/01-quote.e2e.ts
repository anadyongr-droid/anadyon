import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { db, req, MARK, TEST_EMAIL, futureDates, cleanup, flushAfterTasks } from "./helpers";

// The limiter buckets by IP. Sharing one across the phase made every case after
// the tenth fail with 429 — the limiter working, not the endpoint failing.
let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

// The captcha gate is verified for real in its own test below; the rest of the
// funnel is exercised with it satisfied, since Google will never issue a valid
// token to a test process.
vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptcha: async (token: string) => token === "VALID-TEST-TOKEN",
}));

const { POST } = await import("@/app/api/quote/route");

const dates = futureDates(0);
const base = {
  vehicleType: "Car",
  selectedModel: "Hyundai i20",
  pricingGroup: "car_b",
  pickupDate: dates.pickup_date,
  dropoffDate: dates.return_date,
  pickupTime: "10:00",
  dropoffTime: "10:00",
  pickupLocation: "Anadyon Office",
  dropoffLocation: "Anadyon Office",
  transmission: "Manual",
  // The band the form actually sends. This test used to send the number 35,
  // which the form never produces — so the suite passed while every genuine
  // submission was rejected as NaN.
  driverAge: "26–65",
  firstName: "Automated",
  lastName: `Tester ${MARK}`,
  email: TEST_EMAIL,
  mobileTel: "+306900000000",
  rentalDays: 3,
  dailyRate: 30,
  vehicleSubtotal: 90,
  extrasSubtotal: 0,
  total: 90,
  deposit: 27,
  balanceDue: 63,
  captchaToken: "VALID-TEST-TOKEN",
};

let serverTotal = 0;

describe("phase 1 — public quote funnel", () => {
  // This phase creates quotes and a customer; without this they accumulate and
  // the next run collides with them.
  afterAll(async () => { await cleanup(); });
  afterEach(async () => { await flushAfterTasks(); });

  beforeAll(async () => {
    // What the server will independently arrive at, from the live rate card.
    const { calcVehicleSubtotal, calcRentalDays } = await import("@/lib/pricing");
    const { data: rates } = await db.from("rates").select("*");
    const days = calcRentalDays(base.pickupDate, base.dropoffDate, base.pickupTime, base.dropoffTime);
    serverTotal = calcVehicleSubtotal(rates as never, "car_b", base.pickupDate, base.dropoffDate, days);
  });

  it("refuses a submission that fails the captcha", async () => {
    const res = await POST(req("/api/quote", "POST", { ...base, captchaToken: "forged" }, nextIp()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reCAPTCHA/i);
  });

  it("rejects a malformed email before it reaches the database", async () => {
    const res = await POST(req("/api/quote", "POST", { ...base, email: "not-an-address" }, nextIp()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it("rejects a missing surname", async () => {
    const res = await POST(req("/api/quote", "POST", { ...base, lastName: "" }, nextIp()));
    expect(res.status).toBe(400);
  });

  it("rejects an age band it does not recognise", async () => {
    const res = await POST(req("/api/quote", "POST", { ...base, driverAge: "12-15" }, nextIp()));
    expect(res.status).toBe(400);
  });

  it("stores the transmission in the same vocabulary the fleet uses", async () => {
    // vehicles.transmission holds "Manual" / "Automatic", and checkSubstitution
    // compares the quote against it directly. A quote storing the dictionary
    // key "spec.manual" never matches a car saying "Manual", so the guard that
    // stops a manual customer being handed an automatic would refuse every
    // assignment instead of the wrong ones.
    const res = await POST(req("/api/quote", "POST", { ...base, transmission: "Manual" }, nextIp()));
    expect(res.status).toBeLessThan(400);
    const { ref } = await res.json();
    const { data } = await db.from("quotes").select("transmission").eq("ref", ref).single();
    expect(data!.transmission).toBe("Manual");
    expect(data!.transmission).not.toMatch(/^spec\./);
  });

  it("accepts every band the booking form offers", async () => {
    // Driven from the shared list, so the form and the schema cannot drift
    // apart again. Note the en dash — these must match byte for byte.
    const { DRIVER_AGE_BANDS } = await import("@/lib/rentalPolicy");
    for (const band of DRIVER_AGE_BANDS) {
      const res = await POST(req("/api/quote", "POST", { ...base, driverAge: band }, nextIp()));
      expect(res.status, `band ${JSON.stringify(band)} was rejected`).toBeLessThan(400);
    }
  });

  it("accepts a well-formed quote and stores it", async () => {
    const res = await POST(req("/api/quote", "POST", base, nextIp()));
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    expect(body.ref).toMatch(/^[A-Z0-9]{6}$/);

    const { data: row } = await db.from("quotes").select("*").eq("ref", body.ref).single();
    expect(row!.email).toBe(TEST_EMAIL);
    expect(row!.last_name).toContain(MARK);
  });

  it("overrides a tampered client price with its own calculation", async () => {
    // The whole point of the server recalculation: a client that claims €1 must
    // not get a €1 booking.
    const res = await POST(req("/api/quote", "POST", { ...base, total: 1, deposit: 0.3, balanceDue: 0.7 }, nextIp()));
    expect(res.status).toBeLessThan(400);
    const { ref } = await res.json();
    const { data: row } = await db.from("quotes").select("total, deposit, balance_due").eq("ref", ref).single();
    expect(row).not.toBeNull();
    expect(row!.total).toBeCloseTo(serverTotal, 2);
    expect(row!.total).not.toBe(1);
    expect(row!.deposit).toBeCloseTo(serverTotal * 0.3, 1);
  });

  it("accepts a quote with no age given at all", async () => {
    // The field is optional; omitting it must not be treated as a malformed one.
    const { driverAge: _omitted, ...withoutAge } = base;
    const res = await POST(req("/api/quote", "POST", withoutAge, nextIp()));
    expect(res.status).toBeLessThan(400);
  });

  it("takes a complete Greek-side quote", async () => {
    // The Greek pages post to this same endpoint. Nothing about the payload
    // differs, which is the point worth pinning: one funnel, two languages.
    const res = await POST(req("/api/quote", "POST", {
      ...base,
      firstName: "Γιώργος",
      lastName: `Παπαδόπουλος ${MARK}`,
      city: "Ζάκυνθος",
      country: "Greece",
      comments: "Θα φτάσουμε το απόγευμα.",
    }, nextIp()));
    expect(res.status).toBeLessThan(400);
    const { ref } = await res.json();
    const { data } = await db.from("quotes").select("first_name, comments, total").eq("ref", ref).single();
    // Greek must survive the round trip intact — not mangled, not stripped.
    expect(data!.first_name).toBe("Γιώργος");
    expect(data!.comments).toContain("απόγευμα");
    expect(Number(data!.total)).toBeGreaterThan(0);
  });

  it("replays an identical submission idempotently", async () => {
    // The atomic booking RPC fingerprints an identical rapid replay. This is
    // the server-side floor beneath the form's double-click guard: the customer
    // gets the same reference and neither the rows nor the email are doubled.
    const ip = nextIp();
    const a = await POST(req("/api/quote", "POST", { ...base, lastName: `Twice ${MARK}` }, ip));
    const b = await POST(req("/api/quote", "POST", { ...base, lastName: `Twice ${MARK}` }, ip));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const refA = (await a.json()).ref;
    const refB = (await b.json()).ref;
    expect(refA).toBe(refB);

    const { data: quotes } = await db.from("quotes").select("id").eq("ref", refA);
    expect(quotes).toHaveLength(1);
    const { data: reservations } = await db.from("reservations")
      .select("id")
      .eq("quote_id", quotes![0].id);
    expect(reservations).toHaveLength(1);
  });

  it("blocks a customer flagged do-not-rent", async () => {
    const dnrEmail = `dnr.${MARK.toLowerCase()}@example.invalid`;
    // customers.email is uniquely indexed and this phase leaves its rows behind,
    // so a second run collided with its own fixture from the first.
    await db.from("customers").delete().eq("email", dnrEmail);
    const { error: fixtureError } = await db.from("customers").insert({
      first_name: "Blocked", last_name: `Person ${MARK}`,
      full_name: `Blocked Person ${MARK}`,
      // Satisfies the legacy NOT NULL `name` column by hand. Migration 017 makes
      // it nullable and auto-fills it; until that runs, the application itself
      // cannot create a customer at all.
      name: `Blocked Person ${MARK}`,
      email: dnrEmail, do_not_rent: true, dnr_reason: "automated test",
    });
    // A silently failed fixture would make the assertion below meaningless.
    expect(fixtureError, `customer fixture failed: ${fixtureError?.message}`).toBeNull();
    const res = await POST(req("/api/quote", "POST", { ...base, email: dnrEmail }, nextIp()));
    expect(res.status).toBe(403);
  });
});

describe("phase 1b — rate limiting", () => {
  it("stops a caller hammering the quote endpoint", async () => {
    // Ten allowed per fifteen minutes, per IP. The eleventh must be refused —
    // this is what migration 015 restored; before it the limiter failed open.
    const attacker = "198.51.100.250";
    // The window is fifteen minutes and the bucket is durable now, so a second
    // run inside that window would start already exhausted and the first
    // request would come back 429. Clearing it makes the test repeatable.
    await db.from("rate_limits").delete().like("key", `%${attacker}%`);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await POST(req("/api/quote", "POST", { ...base, lastName: `Flood ${MARK}` }, attacker));
      codes.push(res.status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes[0]).toBeLessThan(400);
  });

  it("does not penalise a different caller for that", async () => {
    const res = await POST(req("/api/quote", "POST", { ...base, lastName: `Innocent ${MARK}` }, "198.51.100.251"));
    expect(res.status).toBeLessThan(400);
  });
});
