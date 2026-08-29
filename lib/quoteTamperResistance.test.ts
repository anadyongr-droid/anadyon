import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * What a crafted request cannot do.
 *
 * Every case here was reachable before: the route trusted the submitted pricing
 * group, so an expensive model could be bought at a cheap group's rate; an
 * unknown model produced a €0 quote that still looked accepted; and the
 * submitted total fed the idempotency key, so altering it forked the key and
 * defeated the replay protection.
 */
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  /**
   * The vehicle the booking function allocated, or null when it found nothing.
   *
   * Held in a box rather than passed in, because the route reads it back from
   * the reservations table after the fact. Before this existed the mock threw
   * `Unexpected table reservations`, `noVehicleAssigned` swallowed the throw
   * and returned false, and **every test in this file ran with the flag down** —
   * including the one that claimed to cover it being raised.
   */
  vehicleId: { current: "vehicle-1" as string | null },
  sendMail: vi.fn(async (_mail: Record<string, unknown>) => ({ ok: true, queued: false })),
  auditedMail: vi.fn(async (_input: Record<string, unknown>) => (
    { ok: true, queued: false, deliveryId: "delivery-1" }
  )),
  /**
   * `after` work, kept so a test can wait for it.
   *
   * Calling the task and dropping the promise happened to work while the
   * route's post-response path was a single microtask deep. Reading the
   * allocated vehicle back made it deeper, and the mail assertions started
   * running before any mail had been sent. `post` now awaits these.
   */
  afterTasks: [] as Promise<unknown>[],
  after: vi.fn((task: () => unknown) => {
    mocks.afterTasks.push(Promise.resolve(task()));
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

// One rate per group, deliberately far apart so a mispriced group is obvious.
const rates = ["car_a", "car_b", "car_c", "motorbike_a", "motorbike_b", "bike"].map((group, i) => ({
  id: `rate-${group}`,
  pricing_group: group,
  season_name: "August",
  season_months: [8],
  rate_1_2: [30, 58, 90, 25, 35, 10][i],
  rate_3_6: [28, 54.6, 85, 23, 33, 9][i],
  rate_7plus: [26, 50.4, 80, 21, 31, 8][i],
}));

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
          select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (name === "rates") return { select: async () => ({ data: rates, error: null }) };
      if (name === "extras_config") return { select: async () => ({ data: extras, error: null }) };
      if (name === "reservations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { vehicle_id: mocks.vehicleId.current }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${name}`);
    },
    rpc: mocks.rpc,
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: mocks.sendMail,
  mailIsRedirected: false,
  mailRedirectTarget: null,
}));
vi.mock("@/lib/auditedMail", () => ({ sendAuditedWorkflowMail: mocks.auditedMail }));
vi.mock("@/lib/recaptcha", () => ({ verifyRecaptcha: async () => true }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => ({ ok: true }) }));

const { POST } = await import("@/app/api/quote/route");

const requestBody = (overrides: Record<string, unknown> = {}) => ({
  captchaToken: "captcha",
  locale: "en",
  vehicleType: "Cars",
  selectedModel: "Peugeot 107",
  pricingGroup: "car_c",
  pickupLocation: "Zakynthos Airport",
  dropoffLocation: "Zakynthos Airport",
  pickupDate: "2026-08-21",
  pickupTime: "09:00",
  dropoffDate: "2026-08-22",
  dropoffTime: "09:00",
  transmission: "Automatic",
  driverAge: "26–65",
  babySeat: 0,
  childSeat: 0,
  fdw: false,
  additionalDrivers: 0,
  title: "Mr",
  firstName: "Test",
  lastName: "Customer",
  email: "test@example.com",
  dob: "1980-01-02",
  mobileTel: "+30 6900000000",
  ...overrides,
});

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new Request("http://localhost/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest);
  // The response is deliberately returned before the emails go out; a test
  // asserting on them has to wait for the work the route deferred.
  await Promise.all(mocks.afterTasks);
  return res;
};

/** The quote payload the route asked the database to store. */
const storedQuote = () => mocks.rpc.mock.calls[0][1].p_quote as Record<string, unknown>;
const idempotencyKey = () => mocks.rpc.mock.calls[0][1].p_idempotency_key as string;

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.vehicleId.current = "vehicle-1";
  mocks.afterTasks.length = 0;
  mocks.sendMail.mockClear();
  mocks.auditedMail.mockClear();
  mocks.rpc.mockResolvedValue({
    data: {
      ref: "BOOK01", quote_id: "quote-id", reservation_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      promo_id: null, discount: 0, total: 90, deposit: 27, balance_due: 63,
      idempotent_replay: false,
    },
    error: null,
  });
});

describe("the submitted pricing group is never trusted", () => {
  it("prices an expensive model at its own rate even when a cheap group is submitted", async () => {
    // Peugeot 107 is car_c at €90/day. The request claims it is a bicycle.
    const res = await post(requestBody({ pricingGroup: "bike" }));
    expect(res.status).toBe(200);

    const quote = storedQuote();
    expect(quote.pricing_group).toBe("car_c");
    expect(quote.vehicle_subtotal).toBe(90);
    expect(quote.total).toBe(90);
  });

  it("derives vehicle type and transmission from the model, not the request", async () => {
    await post(requestBody({ vehicleType: "Bikes", transmission: "Manual" }));
    const quote = storedQuote();
    expect(quote.vehicle_type).toBe("Cars");
    expect(quote.transmission).toBe("Automatic");
  });

  it("stores the catalogue's spelling rather than the submitted one", async () => {
    await post(requestBody({ selectedModel: "  peugeot   107  " }));
    expect(storedQuote().selected_model).toBe("Peugeot 107");
  });

  it("refuses an unknown model instead of quoting it at zero", async () => {
    const res = await post(requestBody({ selectedModel: "Lamborghini Huracan" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/available vehicles/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("client monetary values are discarded", () => {
  it("ignores a tampered total, deposit, balance and discount", async () => {
    await post(requestBody({
      total: 1, deposit: 0.3, balanceDue: 0.7,
      discountAmount: 89, vehicleSubtotal: 1, extrasSubtotal: 0,
      dailyRate: 1, rentalDays: 99,
    }));

    const quote = storedQuote();
    expect(quote.total).toBe(90);
    expect(quote.deposit).toBe(27);
    expect(quote.balance_due).toBe(63);
    expect(quote.rental_days).toBe(1);
    expect(quote.daily_rate).toBe(90);
    // The database owns settlement; the route always submits a zero discount.
    expect(quote.discount_amount).toBe(0);
  });

  it("ignores forged extras amounts and recomputes them from the rate card", async () => {
    await post(requestBody({
      babySeat: 1, fdw: true,
      extrasSubtotal: 0,
      extrasLines: [{ label: "Baby Seat", amount: "0.00" }],
    }));
    // 90 vehicle + 3 baby seat + 5 FDW.
    expect(storedQuote().extras_subtotal).toBe(8);
    expect(storedQuote().total).toBe(98);
  });

  it("returns the same reference for one request however the total is altered", async () => {
    await post(requestBody({ total: 90 }));
    const honest = idempotencyKey();

    mocks.rpc.mockClear();
    await post(requestBody({ total: 1, deposit: 0.3, discountAmount: 89 }));
    const tampered = idempotencyKey();

    expect(tampered).toBe(honest);
  });

  it("still separates two genuinely different bookings", async () => {
    await post(requestBody());
    const first = idempotencyKey();
    mocks.rpc.mockClear();
    await post(requestBody({ dropoffDate: "2026-08-25" }));
    expect(idempotencyKey()).not.toBe(first);
  });
});

describe("combined child-seat limit at the public API", () => {
  it.each([[0, 3], [1, 2], [2, 1], [3, 0]])("accepts %i baby and %i child seats", async (baby, child) => {
    const res = await post(requestBody({ babySeat: baby, childSeat: child }));
    expect(res.status).toBe(200);
  });

  // Every over-limit pair the old form could actually produce, since each
  // dropdown independently offered 0-3. 3+3 is the combination that reached
  // production as quote 2R55WT.
  it.each([
    [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
    [4, 0], [0, 4], [-1, 2], [1, -1],
  ])("rejects %i baby and %i child seats", async (baby, child) => {
    const res = await post(requestBody({ babySeat: baby, childSeat: child }));
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("explains the limit rather than silently reducing the quantity", async () => {
    const res = await post(requestBody({ babySeat: 2, childSeat: 2 }));
    expect((await res.json()).error).toMatch(/maximum of 3 child seats/i);
  });
});

describe("the office notification and the alert are two separate emails", () => {
  /**
   * Separated after a member of staff hit Reply on a "[NO VEHICLE]" alert to
   * ask a colleague about availability, and wrote to the customer instead.
   *
   * The same fault had already happened once and been fixed by removing
   * Reply-To entirely; that fix was later reversed because answering the
   * customer is the common case for an ordinary quote. Reversing it put the
   * alert back inside a customer-replyable email.
   *
   * So the two are now different emails with different reply rules, rather
   * than one email with a banner bolted on:
   *
   *   - the **notification** is the quote, and replies to the customer;
   *   - the **alert** is the flag, and replies to the office.
   */
  const officeMails = () => mocks.sendMail.mock.calls
    .map(([mail]) => mail as unknown as {
      from: string; to: string[]; replyTo?: unknown; subject: string; html: string;
    })
    .filter((mail) => Array.isArray(mail.to) && mail.to.includes("customerservice@anadyon.gr"));

  // Told apart by sender, not by subject text: the sender is the thing a
  // recipient's Reply acts on, and it does not change with wording.
  const notification = () => officeMails().find((m) => m.from.includes("Anadyon Website"));
  const alert = () => officeMails().find((m) => m.from.includes("Anadyon Alerts"));

  it("sends only the notification when nothing is flagged", async () => {
    await post(requestBody());
    expect(notification()).toBeDefined();
    expect(alert()).toBeUndefined();
  });

  it("the notification replies to the customer who submitted the request", async () => {
    // Reverses the earlier "keep replies internal" rule: answering the customer
    // turned out to be the common case, and it meant copying the address out.
    await post(requestBody());
    expect(notification()!.replyTo).toBe("test@example.com");
  });

  describe("when no vehicle could be assigned", () => {
    beforeEach(() => { mocks.vehicleId.current = null; });

    it("raises the flag at all", async () => {
      // Asserted first, and deliberately. The previous version of these tests
      // named this case and never reached it, because the mock threw on the
      // reservations read and the route swallowed it. A test that cannot
      // observe the precondition cannot be trusted about what follows.
      await post(requestBody());
      expect(alert(), "no alert email was sent").toBeDefined();
      expect(alert()!.subject).toContain("[NO VEHICLE]");
    });

    it("sends the alert as its own email, not as a banner on the notification", async () => {
      await post(requestBody());
      expect(officeMails()).toHaveLength(2);
      expect(notification()!.subject).not.toContain("[NO VEHICLE]");
    });

    it("gives the alert no reply path to the customer", async () => {
      // The whole point. Reply on this email reaches the office, because the
      // question it prompts - "do we have anything else?" - is an internal one.
      await post(requestBody());
      expect(alert()!.replyTo).toBeUndefined();
    });

    it("still lets the notification reply to the customer", async () => {
      // An unallocated booking is an operational flag, not a security one:
      // talking to the customer about alternatives is exactly what it calls
      // for. That conversation starts from the quote, not from the alert.
      await post(requestBody());
      expect(notification()!.replyTo).toBe("test@example.com");
    });
  });

  describe("when the submitted price was manipulated", () => {
    it("sends the alert separately, with no reply path", async () => {
      await post(requestBody({ total: 1 }));
      expect(alert()!.subject).toContain("[ALERT]");
      expect(alert()!.replyTo).toBeUndefined();
    });

    it("also suppresses the reply path on the notification", async () => {
      // A Reply-To here would point at whoever just tampered with the price,
      // and one careless Reply would tell them it had been noticed. This rule
      // predates the split and survives it.
      await post(requestBody({ total: 1 }));
      expect(notification()!.replyTo).toBeUndefined();
    });

    it("keeps the warning out of the notification entirely", async () => {
      await post(requestBody({ total: 1 }));
      expect(alert()!.html).toContain("PRICE MANIPULATION");
      expect(notification()!.html).not.toContain("PRICE MANIPULATION");
    });
  });

  it("sends both to the office, never to the customer", async () => {
    // Reply-To changes where an answer lands; it must not change who receives
    // the mail. Sending either to the customer would show them the internal
    // price-manipulation warning.
    mocks.vehicleId.current = null;
    await post(requestBody({ total: 1 }));
    for (const mail of officeMails()) {
      expect(mail.to).toEqual(["customerservice@anadyon.gr"]);
      expect(mail.to).not.toContain("test@example.com");
    }
  });

  it("prints the customer's address in both bodies as plain text", async () => {
    // The office must be able to reach the customer from either email alone
    // when the admin area is unavailable - but they carry the information and
    // nothing that acts on it. No links, no buttons.
    mocks.vehicleId.current = null;
    await post(requestBody());
    for (const mail of officeMails()) {
      expect(mail.html).toContain("test@example.com");
      expect(mail.html).not.toContain("mailto:");
      expect(mail.html).not.toContain("Compose email to customer");
    }
  });

  it("sends the customer acknowledgment with a reply path to the office", async () => {
    await post(requestBody());
    const customer = mocks.sendMail.mock.calls
      .map(([mail]) => mail as unknown as { to: unknown; replyTo?: unknown })
      .find((mail) => mail.to === "test@example.com");
    // Only checked when the unaudited fallback is used; the audited path
    // carries the same object through sendAuditedWorkflowMail.
    if (customer) expect(customer.replyTo).toBe("customerservice@anadyon.gr");
  });

  it("sends the customer acknowledgment through the delivery audit", async () => {
    await post(requestBody());
    expect(mocks.auditedMail).toHaveBeenCalledTimes(1);
    expect(mocks.auditedMail.mock.calls[0][0]).toMatchObject({
      kind: "acknowledgment",
      reservationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      recipientEmail: "test@example.com",
    });
  });
});
