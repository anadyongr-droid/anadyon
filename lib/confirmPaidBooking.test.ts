import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  claims: new Set<string>(),
  sendMail: vi.fn(async (_mail: { subject: string }) => ({ ok: true, queued: false })),
}));

vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (name: string) => name === "alert_outbox" ? ({
      insert: async (payload: { key: string }) => {
        if (mocks.claims.has(payload.key)) return { error: { code: "23505", message: "duplicate" } };
        mocks.claims.add(payload.key);
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({
        eq: async (_column: string, key: string) => {
          mocks.claims.delete(key);
          return { error: null };
        },
      }),
    }) : ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: { ...mocks.row }, error: null }),
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => chain,
          maybeSingle: async () => {
            if (mocks.row.deposit_paid_at) return { data: null, error: null };
            mocks.row = { ...mocks.row, ...payload };
            return { data: { ...mocks.row }, error: null };
          },
        };
        return chain;
      },
    }),
  },
}));

const { confirmPaidBooking } = await import("./confirmPaidBooking");

beforeEach(() => {
  mocks.row = {
    id: "reservation-id",
    customer_name: "Alex Customer",
    customer_email: "alex@example.com",
    pickup_date: "2026-08-25",
    pickup_time: "09:00",
    pickup_location: "Zakynthos Airport",
    return_date: "2026-08-28",
    return_time: "09:00",
    total: 100,
    deposit: 30,
    balance_due: 70,
    notes: "Quote ref: ABC123",
    status: "pending",
    deposit_paid_at: null,
    vehicles: { name: "Fiat Panda" },
    quotes: { ref: "ABC123" },
  };
  mocks.sendMail.mockClear();
  mocks.claims.clear();
});

describe("confirmPaidBooking", () => {
  it("records an exact deposit and sends the formal confirmation once", async () => {
    const first = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:00:00Z",
      amountPaid: 30,
      currency: "eur",
    });
    expect(first).toMatchObject({ outcome: "confirmed", reference: "ABC123" });
    expect(mocks.row).toMatchObject({ status: "confirmed", deposit_paid_at: "2026-08-23T10:00:00Z" });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].subject).toBe("Booking confirmed — ABC123");

    const replay = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:05:00Z",
      amountPaid: 30,
      currency: "eur",
    });
    expect(replay.outcome).toBe("already_confirmed");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it("also accepts the complete rental amount", async () => {
    const result = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:00:00Z",
      amountPaid: 100,
      currency: "EUR",
    });
    expect(result.outcome).toBe("confirmed");
    expect(mocks.row.balance_due).toBe(0);
  });

  it("does not confirm or email for the wrong amount or currency", async () => {
    const result = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:00:00Z",
      amountPaid: 1,
      currency: "usd",
    });
    expect(result.outcome).toBe("payment_mismatch");
    expect(mocks.row.deposit_paid_at).toBeNull();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("does not resurrect a cancelled booking when an old link is paid", async () => {
    mocks.row.status = "cancelled";
    const result = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:00:00Z",
      amountPaid: 30,
      currency: "eur",
    });
    expect(result).toMatchObject({ outcome: "invalid_state", status: "cancelled" });
    expect(mocks.row.deposit_paid_at).toBeNull();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("retries an unqueued confirmation email without recording payment twice", async () => {
    mocks.sendMail
      .mockResolvedValueOnce({ ok: false, queued: false })
      .mockResolvedValueOnce({ ok: true, queued: false });

    const first = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:00:00Z",
      amountPaid: 30,
      currency: "eur",
    });
    expect(first.outcome).toBe("error");
    expect(mocks.row.deposit_paid_at).toBe("2026-08-23T10:00:00Z");

    const retry = await confirmPaidBooking({
      reservationId: "reservation-id",
      paidAt: "2026-08-23T10:05:00Z",
      amountPaid: 30,
      currency: "eur",
    });
    expect(retry.outcome).toBe("already_confirmed");
    expect(mocks.row.deposit_paid_at).toBe("2026-08-23T10:00:00Z");
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
  });
});
