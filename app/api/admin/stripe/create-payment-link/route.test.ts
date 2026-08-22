import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mocks.create,
        retrieve: vi.fn(),
        expire: vi.fn(),
      },
    },
    paymentIntents: { retrieve: vi.fn() },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "aabbccdd-1111-2222-3333-444455556666",
              customer_name: "Test Customer",
              customer_email: "test@example.com",
              deposit: 17.4,
              stripe_payment_intent: null,
              notes: "Quote ref: OLD123. Customer notes: Airport pickup",
              quotes: { ref: "C8GW5C" },
            },
            error: null,
          }),
        }),
      }),
      update: (values: unknown) => ({
        eq: async (...where: unknown[]) => {
          mocks.update(values, where);
          return { error: null };
        },
      }),
    }),
  },
}));

process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
const { POST } = await import("./route");

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.create.mockResolvedValue({
    id: "cs_new",
    url: "https://checkout.stripe.com/c/pay/cs_new",
    payment_intent: null,
  });
});

describe("Stripe reservation reference", () => {
  it("shows the website reference while retaining the UUID for reconciliation", async () => {
    const req = new Request("http://localhost/api/admin/stripe/create-payment-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: "aabbccdd-1111-2222-3333-444455556666" }),
    }) as NextRequest;

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reference: "C8GW5C" });

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      client_reference_id: "C8GW5C",
      metadata: {
        reservation_id: "aabbccdd-1111-2222-3333-444455556666",
        reservation_reference: "C8GW5C",
      },
      payment_intent_data: {
        metadata: {
          reservation_id: "aabbccdd-1111-2222-3333-444455556666",
          reservation_reference: "C8GW5C",
        },
      },
      line_items: [expect.objectContaining({
        price_data: expect.objectContaining({
          product_data: expect.objectContaining({
            name: "Anadyon Rentals — Deposit C8GW5C",
            description: "Reservation reference: C8GW5C",
          }),
        }),
      })],
    }));
  });
});
