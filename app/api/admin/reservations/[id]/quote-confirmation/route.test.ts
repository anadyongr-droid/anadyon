import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async (_mail: { subject: string; html: string }) => ({ ok: true, queued: false })),
  row: {} as Record<string, unknown>,
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: mocks.sendMail,
  mailIsRedirected: false,
}));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: mocks.row, error: null }),
        };
        return chain;
      },
    }),
  },
}));

const { POST } = await import("./route");
const params = { params: Promise.resolve({ id: "reservation-id" }) };

beforeEach(() => {
  mocks.sendMail.mockClear();
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
    expect(mail.html).toContain("Your booking is not yet confirmed");
    expect(mail.html).toContain("30% deposit by");
    expect(mail.html).toContain("ABC123");
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
