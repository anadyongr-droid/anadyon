import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Mail } from "@/lib/mailer";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async (_mail: Mail, _options?: Record<string, unknown>) => ({ ok: true, queued: false, providerMessageId: "resend-1" })),
  row: {} as Record<string, unknown>,
  deliveryInsert: null as Record<string, unknown> | null,
  deliveryError: null as { message: string } | null,
  deliveries: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: mocks.sendMail,
  mailIsRedirected: false,
  mailRedirectTarget: null,
}));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (name: string) => {
      if (name === "reservations") return {
        select: () => {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({ data: mocks.row, error: null }),
          };
          return chain;
        },
      };
      if (name === "booking_email_deliveries") return {
        insert: (row: Record<string, unknown>) => {
          mocks.deliveryInsert = row;
          return {
            select: () => ({
              single: async () => ({ data: mocks.deliveryError ? null : { id: "11111111-1111-1111-1111-111111111111" }, error: mocks.deliveryError }),
            }),
          };
        },
        select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: async () => ({ data: mocks.deliveries, error: null }),
        };
        return chain;
        },
      };
      throw new Error(`Unexpected table ${name}`);
    },
  },
}));

const { GET, POST } = await import("./route");
const params = { params: Promise.resolve({ id: "reservation-id" }) };

beforeEach(() => {
  mocks.sendMail.mockClear();
  mocks.deliveryInsert = null;
  mocks.deliveryError = null;
  mocks.deliveries = [];
  mocks.row = {
    id: "reservation-id",
    customer_name: "Alex Customer",
    customer_email: "alex@example.com",
    pickup_date: "2027-08-25",
    pickup_time: "09:00",
    pickup_location: "Zakynthos Airport",
    return_date: "2027-08-28",
    return_time: "09:00",
    total: 197.6,
    deposit: 59.28,
    balance_due: 138.32,
    notes: "Quote ref: ABC123",
    status: "pending",
    deposit_paid_at: null,
    vehicles: { name: "Fiat Panda" },
    quotes: { ref: "ABC123" },
  };
});

describe("POST quote confirmation", () => {
  it("sends the approved non-booking confirmation with a deadline", async () => {
    const request = new Request("http://localhost/api/admin/reservations/reservation-id/quote-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: "2027-08-24T17:00" }),
    }) as NextRequest;
    const response = await POST(request, params);
    expect(response.status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Quote confirmation");
    // Reworded, but the guardrail is unchanged: this is not a confirmed booking.
    expect(mail.html).toContain("Until then the booking isn't confirmed");
    expect(mail.html).toContain("30% deposit by");
    expect(mail.html).toContain("ABC123");
    expect(mail.replyTo).toBe("customerservice@anadyon.gr");
    expect(mail.bcc).toEqual(["customerservice@anadyon.gr"]);
    expect(mail.tags).toContainEqual({ name: "delivery_id", value: "11111111-1111-1111-1111-111111111111" });
    expect(mocks.sendMail.mock.calls[0][1]).toEqual({
      deliveryId: "11111111-1111-1111-1111-111111111111",
      idempotencyKey: "quote-confirmation-11111111-1111-1111-1111-111111111111",
    });
    expect(mocks.deliveryInsert).toMatchObject({
      reservation_id: "reservation-id",
      intended_recipient_email: "alex@example.com",
      delivery_recipient_email: "alex@example.com",
      subject: "Quote confirmation",
      redirected: false,
    });
  });

  it("does not send when the permanent audit row cannot be created", async () => {
    mocks.deliveryError = { message: "relation missing" };
    const request = new Request("http://localhost/api/admin/reservations/reservation-id/quote-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: "2027-08-24T17:00" }),
    }) as NextRequest;
    const response = await POST(request, params);
    expect(response.status).toBe(503);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("returns the permanent delivery history for the reservation", async () => {
    mocks.deliveries = [{ id: "delivery-1", status: "delivered", intended_recipient_email: "alex@example.com" }];
    const response = await GET(new Request("http://localhost") as NextRequest, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deliveries: mocks.deliveries });
  });

  it("refuses to issue a quote confirmation after payment", async () => {
    mocks.row = { ...mocks.row, status: "confirmed", deposit_paid_at: "2027-08-23T10:00:00Z" };
    const request = new Request("http://localhost/api/admin/reservations/reservation-id/quote-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: "2027-08-24T17:00" }),
    }) as NextRequest;
    const response = await POST(request, params);
    expect(response.status).toBe(409);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
