import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assessNbgOrder,
  getNbgConfig,
  initiateNbgPaymentLink,
  isAllowedNbgCheckoutUrl,
  NbgConfigurationError,
  type NbgConfig,
} from "@/lib/nbg";

const ENV_KEYS = [
  "NBG_PAY_ENABLED",
  "NBG_PAY_ENVIRONMENT",
  "NBG_PAY_MERCHANT_ID",
  "NBG_PAY_API_PASSWORD",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const config: NbgConfig = {
  environment: "test",
  gatewayOrigin: "https://test.ibanke-commerce.nbg.gr",
  merchantId: "TEST_MERCHANT",
  apiPassword: "secret-for-test",
  siteUrl: "https://preview.example.test",
};

beforeEach(() => {
  process.env.NBG_PAY_ENABLED = "true";
  process.env.NBG_PAY_ENVIRONMENT = "test";
  process.env.NBG_PAY_MERCHANT_ID = "TEST_MERCHANT";
  process.env.NBG_PAY_API_PASSWORD = "secret-for-test";
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.test/path";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("NBG configuration", () => {
  it("is disabled unless the feature gate is exactly true", () => {
    process.env.NBG_PAY_ENABLED = "false";
    expect(() => getNbgConfig()).toThrow(NbgConfigurationError);
  });

  it("uses only an allow-listed gateway and strips the site URL to its origin", () => {
    expect(getNbgConfig()).toMatchObject({
      environment: "test",
      gatewayOrigin: "https://test.ibanke-commerce.nbg.gr",
      siteUrl: "https://preview.example.test",
    });
  });

  it("refuses non-HTTPS return URLs away from localhost", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://anadyon.gr";
    expect(() => getNbgConfig()).toThrow(/HTTPS/);
  });
});

describe("NBG hosted payment links", () => {
  it("sends the server-owned EUR amount and PURCHASE operation with Basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: "SUCCESS",
      successIndicator: "indicator",
      paymentLink: {
        id: "payment-link-id",
        url: "https://test.ibanke-commerce.nbg.gr/checkout/pay/test",
        expiryDateTime: "2026-08-24T12:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const link = await initiateNbgPaymentLink(config, {
      orderId: "AN-ORDER-1",
      amount: 112.26,
      reservationId: "00000000-0000-4000-8000-000000000001",
      returnUrl: "https://preview.example.test/api/nbg/return?attempt=a",
      errorUrl: "https://preview.example.test/payment/complete?status=error",
      expiresAt: "2026-08-24T12:00:00.000Z",
    });

    expect(link.url).toContain("test.ibanke-commerce.nbg.gr");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe("https://test.ibanke-commerce.nbg.gr");
    expect(url.pathname).toBe("/api/rest/version/100/merchant/TEST_MERCHANT/session");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("merchant.TEST_MERCHANT:secret-for-test").toString("base64")}`,
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      apiOperation: "INITIATE_CHECKOUT",
      checkoutMode: "PAYMENT_LINK",
      interaction: { operation: "PURCHASE" },
      order: { id: "AN-ORDER-1", amount: "112.26", currency: "EUR" },
    });
  });

  it("rejects a successful response that points outside NBG", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: "SUCCESS",
      paymentLink: { url: "https://attacker.example/pay" },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(initiateNbgPaymentLink(config, {
      orderId: "AN-ORDER-2",
      amount: 10,
      reservationId: "00000000-0000-4000-8000-000000000002",
      returnUrl: "https://preview.example.test/api/nbg/return?attempt=b",
      errorUrl: "https://preview.example.test/payment/complete?status=error",
      expiresAt: "2026-08-24T12:00:00.000Z",
    })).rejects.toThrow(/valid hosted payment link/);
  });

  it("accepts only exact NBG HTTPS origins", () => {
    expect(isAllowedNbgCheckoutUrl("https://test.ibanke-commerce.nbg.gr/checkout/x", "test")).toBe(true);
    expect(isAllowedNbgCheckoutUrl("https://test.ibanke-commerce.nbg.gr.evil.example/x", "test")).toBe(false);
    expect(isAllowedNbgCheckoutUrl("http://test.ibanke-commerce.nbg.gr/x", "test")).toBe(false);
  });
});

describe("NBG order reconciliation", () => {
  const captured = {
    result: "SUCCESS",
    id: "AN-ORDER-3",
    amount: "112.26",
    totalCapturedAmount: "112.26",
    currency: "EUR",
    status: "CAPTURED",
    transaction: [{
      result: "SUCCESS",
      order: { amount: "112.26", currency: "EUR" },
      response: { gatewayCode: "APPROVED" },
      transaction: { type: "PAYMENT" },
    }],
  };

  it("accepts an exact captured and approved payment", () => {
    expect(assessNbgOrder(captured, {
      orderId: "AN-ORDER-3",
      amount: 112.26,
      currency: "EUR",
    })).toMatchObject({ paid: true, reason: "captured" });
  });

  it.each([
    ["wrong amount", { ...captured, amount: "112.25" }, "amount"],
    ["wrong currency", { ...captured, currency: "USD" }, "currency"],
    ["not captured", { ...captured, status: "AUTHORIZED" }, "not_captured"],
    ["partial capture", { ...captured, totalCapturedAmount: "100.00" }, "captured_amount"],
    ["no approved transaction", { ...captured, transaction: [] }, "no_approved_payment"],
  ])("rejects %s", (_label, response, reason) => {
    expect(assessNbgOrder(response, {
      orderId: "AN-ORDER-3",
      amount: 112.26,
      currency: "EUR",
    })).toMatchObject({ paid: false, reason });
  });
});
