import "server-only";

const API_VERSION = "100";
const GATEWAYS = {
  test: "https://test.ibanke-commerce.nbg.gr",
  production: "https://ibanke-commerce.nbg.gr",
} as const;

export type NbgEnvironment = keyof typeof GATEWAYS;

export class NbgConfigurationError extends Error {}
export class NbgGatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface NbgConfig {
  environment: NbgEnvironment;
  gatewayOrigin: string;
  merchantId: string;
  apiPassword: string;
  siteUrl: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function validSiteUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NbgConfigurationError("NEXT_PUBLIC_SITE_URL must be an absolute URL.");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new NbgConfigurationError("NBG return URLs must use HTTPS outside localhost.");
  }
  return url.origin;
}

export function getNbgConfig(): NbgConfig {
  if (process.env.NBG_PAY_ENABLED !== "true") {
    throw new NbgConfigurationError("NBG Pay is not enabled in this environment.");
  }

  const environment = process.env.NBG_PAY_ENVIRONMENT;
  if (environment !== "test" && environment !== "production") {
    throw new NbgConfigurationError("NBG_PAY_ENVIRONMENT must be test or production.");
  }

  const merchantId = process.env.NBG_PAY_MERCHANT_ID?.trim() ?? "";
  const apiPassword = process.env.NBG_PAY_API_PASSWORD ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

  if (!/^[A-Za-z0-9_-]{1,40}$/.test(merchantId)) {
    throw new NbgConfigurationError("NBG_PAY_MERCHANT_ID is missing or invalid.");
  }
  if (!apiPassword.trim()) {
    throw new NbgConfigurationError("NBG_PAY_API_PASSWORD is missing.");
  }
  if (!siteUrl) {
    throw new NbgConfigurationError("NEXT_PUBLIC_SITE_URL is missing.");
  }

  return {
    environment,
    gatewayOrigin: GATEWAYS[environment],
    merchantId,
    apiPassword,
    siteUrl: validSiteUrl(siteUrl),
  };
}

function authorization(config: NbgConfig): string {
  return `Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`, "utf8").toString("base64")}`;
}

async function gatewayRequest(
  config: NbgConfig,
  path: string,
  init: RequestInit,
): Promise<JsonObject> {
  const url = new URL(path, config.gatewayOrigin);
  if (url.origin !== config.gatewayOrigin) {
    throw new NbgGatewayError("Refused an unexpected NBG gateway origin.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...init.headers,
        Accept: "application/json",
        Authorization: authorization(config),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new NbgGatewayError("NBG Pay could not be reached.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const explanation = string(object(data)?.explanation);
    throw new NbgGatewayError(explanation ?? `NBG Pay returned HTTP ${response.status}.`, response.status);
  }
  const parsed = object(data);
  if (!parsed) throw new NbgGatewayError("NBG Pay returned an invalid response.");
  return parsed;
}

export function isAllowedNbgCheckoutUrl(raw: string, environment: NbgEnvironment): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.origin === GATEWAYS[environment];
  } catch {
    return false;
  }
}

export interface InitiateNbgPaymentLinkInput {
  orderId: string;
  amount: number;
  reservationId: string;
  returnUrl: string;
  errorUrl: string;
  expiresAt: string;
}

export interface NbgPaymentLink {
  url: string;
  paymentLinkId: string | null;
  sessionId: string | null;
  successIndicator: string | null;
  expiresAt: string | null;
  result: string;
}

export async function initiateNbgPaymentLink(
  config: NbgConfig,
  input: InitiateNbgPaymentLinkInput,
): Promise<NbgPaymentLink> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(input.orderId)) {
    throw new NbgGatewayError("The NBG order identifier is invalid.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new NbgGatewayError("The NBG payment amount is invalid.");
  }

  const data = await gatewayRequest(
    config,
    `/api/rest/version/${API_VERSION}/merchant/${encodeURIComponent(config.merchantId)}/session`,
    {
      method: "POST",
      body: JSON.stringify({
        apiOperation: "INITIATE_CHECKOUT",
        checkoutMode: "PAYMENT_LINK",
        interaction: {
          operation: "PURCHASE",
          returnUrl: input.returnUrl,
        },
        order: {
          id: input.orderId,
          amount: input.amount.toFixed(2),
          currency: "EUR",
          description: "Anadyon Rentals reservation deposit",
          customerReference: input.reservationId,
        },
        paymentLink: {
          expiryDateTime: input.expiresAt,
          numberOfAllowedAttempts: 5,
          errorUrl: input.errorUrl,
        },
      }),
    },
  );

  const paymentLink = object(data.paymentLink);
  const session = object(data.session);
  const result = string(data.result) ?? "UNKNOWN";
  const url = string(paymentLink?.url);
  if (result !== "SUCCESS" || !url || !isAllowedNbgCheckoutUrl(url, config.environment)) {
    throw new NbgGatewayError("NBG Pay did not return a valid hosted payment link.");
  }

  return {
    url,
    paymentLinkId: string(paymentLink?.id),
    sessionId: string(session?.id),
    successIndicator: string(data.successIndicator),
    expiresAt: string(paymentLink?.expiryDateTime),
    result,
  };
}

export async function retrieveNbgOrder(config: NbgConfig, orderId: string): Promise<JsonObject> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(orderId)) {
    throw new NbgGatewayError("The NBG order identifier is invalid.");
  }
  return gatewayRequest(
    config,
    `/api/rest/version/${API_VERSION}/merchant/${encodeURIComponent(config.merchantId)}/order/${encodeURIComponent(orderId)}`,
    { method: "GET" },
  );
}

export interface NbgOrderAssessment {
  paid: boolean;
  reason: string;
  gatewayResult: string;
}

/**
 * Fail-closed interpretation of Retrieve Order.
 *
 * A browser redirect can never satisfy this function. The gateway must report
 * a captured order and a successful approved payment transaction, with the
 * exact server-recorded order, amount and currency.
 */
export function assessNbgOrder(
  response: JsonObject,
  expected: { orderId: string; amount: number; currency: "EUR" },
): NbgOrderAssessment {
  const result = string(response.result) ?? "UNKNOWN";
  const orderId = string(response.id);
  const amount = Number(response.amount);
  const capturedAmount = Number(response.totalCapturedAmount);
  const currency = string(response.currency);
  const status = string(response.status);

  if (result !== "SUCCESS") return { paid: false, reason: "gateway_result", gatewayResult: result };
  if (orderId !== expected.orderId) return { paid: false, reason: "order_id", gatewayResult: result };
  if (currency !== expected.currency) return { paid: false, reason: "currency", gatewayResult: result };
  if (!Number.isFinite(amount) || Math.abs(amount - expected.amount) >= 0.01) {
    return { paid: false, reason: "amount", gatewayResult: result };
  }
  if (status !== "CAPTURED") return { paid: false, reason: "not_captured", gatewayResult: result };
  if (!Number.isFinite(capturedAmount) || Math.abs(capturedAmount - expected.amount) >= 0.01) {
    return { paid: false, reason: "captured_amount", gatewayResult: result };
  }

  const transactions = Array.isArray(response.transaction) ? response.transaction : [];
  const approved = transactions.some((candidate) => {
    const transaction = object(candidate);
    if (!transaction) return false;
    const transactionOrder = object(transaction.order);
    const transactionResponse = object(transaction.response);
    const transactionDetails = object(transaction.transaction);
    const transactionAmount = Number(transactionOrder?.amount ?? amount);
    const transactionCurrency = string(transactionOrder?.currency) ?? currency;
    const type = string(transactionDetails?.type);
    return transaction.result === "SUCCESS"
      && (type === "PAYMENT" || type === "PURCHASE")
      && transactionResponse?.gatewayCode === "APPROVED"
      && Number.isFinite(transactionAmount)
      && Math.abs(transactionAmount - expected.amount) < 0.01
      && transactionCurrency === expected.currency;
  });

  return approved
    ? { paid: true, reason: "captured", gatewayResult: result }
    : { paid: false, reason: "no_approved_payment", gatewayResult: result };
}
