import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  confirmPaidBooking: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }),
}));
vi.mock("@/lib/confirmPaidBooking", () => ({
  confirmPaidBooking: mocks.confirmPaidBooking,
}));

const { GET } = await import("./route");

function request(sessionId = "cs_test_123") {
  return new NextRequest(`https://anadyon.gr/api/admin/stripe/success?session_id=${sessionId}`);
}

beforeEach(() => {
  mocks.retrieve.mockReset();
  mocks.confirmPaidBooking.mockReset();
});

describe("Stripe customer return", () => {
  it("shows the confirmed public page after a verified payment", async () => {
    mocks.retrieve.mockResolvedValue({
      payment_status: "paid",
      created: 1_777_000_000,
      amount_total: 3_000,
      currency: "eur",
      metadata: { reservation_id: "reservation-id", reservation_reference: "ABC123" },
    });
    mocks.confirmPaidBooking.mockResolvedValue({
      outcome: "confirmed",
      reference: "ABC123",
      expectedDeposit: 30,
      total: 100,
      emailQueued: false,
    });

    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://anadyon.gr/payment/success?reference=ABC123");
  });

  it("shows manual review rather than falsely saying payment was cancelled", async () => {
    mocks.retrieve.mockRejectedValue(new Error("temporary Stripe error"));
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://anadyon.gr/payment/success?review=1");
  });

  it("shows manual review when a paid session has no reservation mapping", async () => {
    mocks.retrieve.mockResolvedValue({ payment_status: "paid", metadata: {} });
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://anadyon.gr/payment/success?review=1");
  });

  it("uses the cancelled page only when Checkout is not paid", async () => {
    mocks.retrieve.mockResolvedValue({ payment_status: "unpaid", metadata: { reservation_id: "reservation-id" } });
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://anadyon.gr/payment/cancelled");
  });
});
