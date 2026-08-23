import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendMail: vi.fn(),
  after: vi.fn((task: () => unknown) => task()),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

const rates = [{
  id: "rate-august-car-b",
  pricing_group: "car_b",
  season_name: "August",
  season_months: [8],
  rate_1_2: 58,
  rate_3_6: 54.6,
  rate_7plus: 50.4,
}];

const extras = [
  { id: "fdw", key: "fdw", label: "FDW", daily_rate: 5, enabled: true },
  { id: "baby", key: "baby_seat", label: "Baby seat", daily_rate: 3, enabled: true },
  { id: "child", key: "child_seat", label: "Child seat", daily_rate: 3, enabled: true },
  { id: "driver", key: "additional_drivers", label: "Additional driver", daily_rate: 2.5, enabled: true },
];

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (name: string) => {
      if (name === "customers") {
        return {
          select: () => ({
            ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      if (name === "rates") {
        return { select: async () => ({ data: rates, error: null }) };
      }
      if (name === "extras_config") {
        return { select: async () => ({ data: extras, error: null }) };
      }
      throw new Error(`Unexpected table ${name}`);
    },
    rpc: mocks.rpc,
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: mocks.sendMail,
}));

vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptcha: async () => true,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async () => ({ ok: true }),
}));

const { POST } = await import("@/app/api/quote/route");

const requestBody = (overrides: Record<string, unknown> = {}) => ({
  captchaToken: "captcha",
  locale: "en",
  vehicleType: "Cars",
  selectedModel: "Hyundai i20",
  pricingGroup: "car_b",
  pickupLocation: "Airport",
  dropoffLocation: "Airport",
  pickupDate: "2026-08-21",
  pickupTime: "09:00",
  dropoffDate: "2026-08-22",
  dropoffTime: "09:00",
  transmission: "Manual",
  driverAge: "26–65",
  babySeat: 0,
  childSeat: 0,
  fdw: false,
  additionalDrivers: 0,
  rentalDays: 1,
  dailyRate: 58,
  vehicleSubtotal: 58,
  extrasSubtotal: 0,
  total: 58,
  deposit: 17.4,
  balanceDue: 40.6,
  title: "Mr",
  firstName: "Test",
  lastName: "Customer",
  email: "test@example.com",
  dob: "1980-01-02",
  flightNumber: "a3 320",
  mobileTel: "+30 6900000000",
  ...overrides,
});

const post = (body = requestBody()) => new Request("http://localhost/api/quote", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}) as NextRequest;

const booking = (overrides: Record<string, unknown> = {}) => ({
  ref: "BOOK01",
  quote_id: "quote-id",
  promo_id: null,
  discount: 0,
  total: 58,
  deposit: 17.4,
  balance_due: 40.6,
  idempotent_replay: false,
  ...overrides,
});

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.sendMail.mockReset();
  mocks.after.mockClear();
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: booking(), error: null });
});

describe("POST /api/quote atomic booking", () => {
  it("returns 5xx and sends no email when the transaction fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "insert failed" } });

    const response = await POST(post());

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("returns the original reference and sends no email for a replay", async () => {
    mocks.rpc.mockResolvedValue({
      data: booking({ ref: "FIRST1", idempotent_replay: true }),
      error: null,
    });

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, ref: "FIRST1" });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("sends pre-discount server money to Postgres and emails the totals Postgres returns", async () => {
    mocks.rpc.mockResolvedValue({
      data: booking({
        promo_id: "promo-id",
        discount: 5.8,
        total: 52.2,
        deposit: 15.66,
        balance_due: 36.54,
      }),
      error: null,
    });

    const response = await POST(post(requestBody({
      promoCode: "SAVE10",
      total: 52.2,
      deposit: 15.66,
      balanceDue: 36.54,
    })));

    expect(response.status).toBe(200);
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_quote).toMatchObject({ total: 58, deposit: 17.4, balance_due: 40.6 });
    expect(args.p_reservation).toMatchObject({ total: 58, deposit: 17.4, balance_due: 40.6 });
    expect(args).toMatchObject({ p_promo_code: "SAVE10", p_deposit_rate: 0.3 });

    const html = mocks.sendMail.mock.calls.map(([mail]) => mail.html).join("\n");
    expect(html).toContain("€52.20");
    expect(html).toContain("€15.66");
    expect(html).toContain("€36.54");
    expect(html).toContain("−€5.80");
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("books an exhausted promo at the full server price", async () => {
    mocks.rpc.mockResolvedValue({ data: booking({ discount: 0, promo_id: null }), error: null });

    const response = await POST(post(requestBody({ promoCode: "EXHAUSTED" })));

    expect(response.status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
    const html = mocks.sendMail.mock.calls.map(([mail]) => mail.html).join("\n");
    expect(html).toContain("€58.00");
    expect(html).not.toContain("Promo code (EXHAUSTED)");
  });

  it("labels the first customer email as an acknowledgment, not a reservation confirmation", async () => {
    const response = await POST(post());

    expect(response.status).toBe(200);
    const customerMail = mocks.sendMail.mock.calls
      .map(([mail]) => mail)
      .find((mail) => mail.to === "test@example.com");
    expect(customerMail).toMatchObject({
      subject: "Reservation request acknowledgment — BOOK01",
    });
    expect(customerMail.html).toContain("acknowledges receipt of your request");
    expect(customerMail.html).toContain("is not a reservation confirmation");
  });

  it("sends a Greek acknowledgment for a request submitted on the Greek site", async () => {
    const response = await POST(post(requestBody({ locale: "el", fdw: true, extrasSubtotal: 5, total: 63 })));

    expect(response.status).toBe(200);
    const customerMail = mocks.sendMail.mock.calls
      .map(([mail]) => mail)
      .find((mail) => mail.to === "test@example.com");
    expect(customerMail.subject).toBe("Επιβεβαίωση παραλαβής αιτήματος κράτησης — BOOK01");
    expect(customerMail.html).toContain("δεν αποτελεί επιβεβαίωση κράτησης");
    expect(customerMail.html).toContain("Πλήρης Κάλυψη Ζημιών");
    expect(customerMail.html).toContain("https://anadyon.gr/el/quote/BOOK01");
  });

  it("derives the same idempotency key for the same submission", async () => {
    await POST(post());
    await POST(post());

    const first = mocks.rpc.mock.calls[0][1].p_idempotency_key;
    const second = mocks.rpc.mock.calls[1][1].p_idempotency_key;
    expect(first).toMatch(/^web-v1:[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("copies the customer identity into the operational reservation", async () => {
    const response = await POST(post(requestBody({ dob: "1980-01-02" })));

    expect(response.status).toBe(200);
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_reservation).toMatchObject({
      customer_first_name: "Test",
      customer_last_name: "Customer",
      customer_dob: "1980-01-02",
      flight_number: "A3 320",
    });
  });

  it("stores the DOB-derived age band even when the client sends a contradictory band", async () => {
    const response = await POST(post(requestBody({
      dob: "2002-01-01",
      pickupDate: "2026-08-21",
      driverAge: "26–65",
    })));

    expect(response.status).toBe(200);
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_quote.driver_age).toBe("21–25");
  });

  it("copies every website field represented on an operational reservation", async () => {
    const response = await POST(post(requestBody({
      babySeat: 1,
      childSeat: 2,
      fdw: true,
      additionalDrivers: 1,
      promoCode: "SUMMER10",
      comments: "Please meet us at arrivals.",
    })));

    expect(response.status).toBe(200);
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_reservation).toMatchObject({
      customer_name: "Test Customer",
      customer_first_name: "Test",
      customer_last_name: "Customer",
      customer_email: "test@example.com",
      customer_phone: "+30 6900000000",
      customer_dob: "1980-01-02",
      pickup_date: "2026-08-21",
      pickup_time: "09:00",
      return_date: "2026-08-22",
      return_time: "09:00",
      pickup_location: "Airport",
      dropoff_location: "Airport",
      rental_days: 1,
      daily_rate: 58,
      vehicle_subtotal: 58,
      extras_subtotal: 16.5,
      baby_seat: 1,
      child_seat: 2,
      fdw: true,
      additional_drivers: 1,
      total: 74.5,
      deposit: 22.35,
      balance_due: 52.15,
      discount_reason: "Promo: SUMMER10",
      status: "pending",
      source: "website",
      notes: expect.stringMatching(/^Quote ref: [A-Z0-9]+\. Customer notes: Please meet us at arrivals\.$/),
    });
    expect(args.p_quote).toMatchObject({ flight_number: "A3 320" });
  });
});
