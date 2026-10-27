/**
 * The real Zoho Mail client, written against Zoho's published API rather than
 * from memory, and **closed by default wherever the documentation is silent**.
 *
 * Read 27 October 2026 from Zoho's own pages:
 *
 * - send is `POST {api_domain}/api/accounts/{accountId}/messages`, with
 *   `Authorization: Zoho-oauthtoken <token>`, scope `ZohoMail.messages.CREATE`
 *   or `ZohoMail.messages.ALL`;
 * - the documented body fields are `fromAddress`*, `toAddress`*, `ccAddress`,
 *   `bccAddress`, `subject`, `content`, `mailFormat` (`html` | `plaintext`),
 *   `askReceipt`, `encoding`, and `attachments` as an array of
 *   `{ storeName, attachmentPath, attachmentName }`;
 * - attachments must first go through
 *   `POST /api/accounts/{accountId}/messages/attachments`, which returns those
 *   three values;
 * - the OAuth token endpoint is `POST {accounts_host}/oauth/v2/token` with
 *   `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`;
 *   the response carries `access_token`, `expires_in` (3600), `token_type` and
 *   **`api_domain`**, and Zoho's multi-DC page says to send API requests to the
 *   `api_domain` the token response gives. This client therefore never carries
 *   a hardcoded API host — see `resolveApiDomain` below;
 * - the accounts host for the European data centre is `https://accounts.zoho.eu`,
 *   which is this mailbox's, the MX being `mx*.zoho.eu`;
 * - status is carried by the HTTP code — 200/201 success, 400 bad input, 401
 *   unauthenticated, 403 not permitted, 404 wrong resource, 500 server. No
 *   throttling code is documented.
 *
 * **Three things the documentation does not say, and this client refuses
 * rather than guesses.** §8: a guess that compiles looks like knowledge, and
 * each of these fails in a way the office would not see.
 *
 * 1. **Whether `toAddress` accepts more than one recipient, and with what
 *    separator.** Every published sample passes one address and the field is
 *    described in the singular. A comma-joined list that Zoho reads as a single
 *    malformed address — or as the first address only — delivers to fewer
 *    people than the sender believes, silently. So a send to more than one
 *    recipient is **refused** until `capabilities.multipleRecipientsPerField`
 *    is turned on by someone who has watched a two-recipient message arrive at
 *    both.
 * 2. **Whether a reply can carry `In-Reply-To` / `References`.** There is no
 *    documented body field for either. Dropping them would send a reply that
 *    starts a new thread in the customer's mailbox — a customer-visible change,
 *    so not an agent's to make quietly (`DEFINING-STATEMENTS.md` §13). A send
 *    carrying threading headers is **refused** until
 *    `capabilities.threadingHeaders` is turned on.
 * 3. **Whether a copy reaches Sent.** Undocumented, so `savedToSent` is
 *    reported `false` from this client, meaning *not established* rather than
 *    *known absent*. The reconciliation detector is the instrument that
 *    answers it per message; see `reconcile.ts`.
 *
 * And one gap that is ours, not Zoho's: `Attachment` in `sendRequest.ts`
 * carries a filename, a content type and a **byte count** — not the bytes. The
 * validator never needed them. So this client cannot run the upload step, and
 * a send carrying attachments is refused with that reason. Closing it means
 * widening the request type, which is a Stage 2 change.
 */

import type { ValidatedSend } from "./sendRequest";
import type { Delivery, SendOutcome, ZohoMailClient } from "./zohoClient";

/** Zoho's accounts host for the European data centre. */
export const ZOHO_EU_ACCOUNTS_HOST = "https://accounts.zoho.eu";

/**
 * **Review finding 8.** The refresh token and the client secret go to the
 * accounts host, and the bearer token goes to the API host. Both were taken
 * from configuration with no check at all, so one wrong environment variable —
 * or one tampered token response, since `api_domain` arrives over the wire —
 * would post Anadyon's Zoho credentials to a host of someone else's choosing.
 *
 * So both are checked against an explicit allowlist of Zoho's own data-centre
 * hosts. The list is exhaustive for the published data centres rather than
 * narrowed to the EU, because narrowing it would break the day the mailbox
 * moves and the failure would look like an authentication problem. HTTPS is
 * required: `http` is not merely downgraded, it is refused.
 */
const ZOHO_HOST_SUFFIXES = Object.freeze([
  "zoho.com", "zoho.eu", "zoho.in", "zoho.com.au", "zoho.jp",
  "zohocloud.ca", "zoho.sa", "zoho.uk", "zohoapis.com", "zohoapis.eu",
  "zohoapis.in", "zohoapis.com.au", "zohoapis.jp", "zohoapis.ca",
  "zohoapis.sa", "zohoapis.uk",
]);

/**
 * True only for an `https://` origin whose host is, or is a subdomain of, one
 * of Zoho's. Compared on labels so `zoho.eu.evil.example` cannot pass, which a
 * `endsWith` check would have let through.
 */
export function isZohoHost(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return ZOHO_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** The scope the send call needs, per Zoho's page for that endpoint. */
export const ZOHO_SEND_SCOPE = "ZohoMail.messages.CREATE";

/**
 * What this deployment has *proved* Zoho does, not what it hopes. Every flag
 * starts false and may only be set by someone who has watched the behaviour,
 * because each one of them fails silently in the customer's direction.
 */
export type ZohoCapabilities = {
  readonly multipleRecipientsPerField: boolean;
  readonly attachments: boolean;
};

export const NOTHING_PROVEN: ZohoCapabilities = Object.freeze({
  multipleRecipientsPerField: false,
  attachments: false,
});

/**
 * **There is deliberately no `threadingHeaders` flag, and review finding 5 is
 * why.** The first version had one. Turning it on removed the refusal — and
 * `buildSendBody` still emitted no threading field, because there is no
 * documented field to emit. So the flag was a trapdoor: its only effect was to
 * convert a visible refusal into the silent unthreaded send the refusal
 * existed to prevent. One of this file's own tests asserts the request body
 * never carries a threading value, which should have made that obvious.
 *
 * A reply carrying `In-Reply-To` or `References` is therefore refused
 * unconditionally. The flag comes back when there is a request shape to put
 * behind it, proved against a live account — not before.
 */

export type AccessToken = {
  readonly accessToken: string;
  /** From the token response. Zoho's multi-DC page says to use this host. */
  readonly apiDomain: string;
};

/**
 * Supplies a currently valid token. Kept as an interface so that no refresh
 * token, client id or client secret is ever a value in this module — the
 * relay's deployment owns them, and this file can be read in a transcript
 * without leaking one.
 */
export interface TokenSource {
  token(): Promise<AccessToken | undefined>;
}

/**
 * The subset of `fetch` this client uses, so tests need no network. `signal` is
 * part of it because the deadline has to reach the transport — review finding 7
 * was that `timeoutMs` was declared and never used, so a hung Zoho held an
 * office send open indefinitely and the claim with it.
 */
export type HttpFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ status: number; text(): Promise<string> }>;

/** Default deadline for one Zoho call. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Runs `work` under a deadline and says which way it ended.
 *
 * **An abort is `timedOut`, never `failed`.** The request was already on the
 * wire when the clock ran out, so Zoho may well have accepted the message —
 * which makes this an ambiguous outcome, not a failed one. Treating a timeout
 * as a failure is how the first version would have sent a customer two copies.
 */
async function withDeadline<T>(
  timeoutMs: number,
  work: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: boolean }> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeoutMs);
  try {
    return { ok: true, value: await work(controller?.signal) };
  } catch {
    return { ok: false, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

export type ZohoApiClientOptions = {
  readonly accountId: string;
  readonly tokens: TokenSource;
  readonly fetch: HttpFetch;
  readonly capabilities?: ZohoCapabilities;
  /**
   * Guards against a hung upstream holding an office send open, and the claim
   * with it. Defaults to DEFAULT_TIMEOUT_MS; a timeout yields `unknown`.
   */
  readonly timeoutMs?: number;
};

/**
 * Refused before the network, with the reason the office needs to read. These
 * are not user-facing — the relay replaces them with its own fixed string —
 * but they reach the audit record, so they say what was wrong.
 */
const REFUSALS = {
  noToken: "No Zoho access token is available.",
  noApiDomain: "The token response carried no api_domain, and this client will not guess a host.",
  apiDomainNotZoho:
    "The api_domain in the token response is not an https Zoho host, so the access token will not be sent to it.",
  multipleRecipients:
    "Zoho does not document more than one address per recipient field, and this deployment has not proved it. Send to one recipient, or prove it and enable multipleRecipientsPerField.",
  threading:
    "Zoho documents no In-Reply-To or References field, and there is no configuration that changes that. Sending would break the customer's thread silently, so it is refused.",
  attachments:
    "Attachment content is not carried in a send request, so the Zoho upload step cannot run. This is a Stage 2 change to the request type, not a configuration.",
} as const;

/** Refused before the request was made, so nothing is in flight. */
const notAttempted = (failure: string): SendOutcome => ({ ok: false, delivery: "not_attempted", failure });

/** The request was made and we cannot tell what happened. Never auto-retried. */
const indeterminate = (failure: string): SendOutcome => ({ ok: false, delivery: "unknown", failure });

/** Zoho answered with a definite refusal. Not sent, and a retry is refused too. */
const rejected = (failure: string): SendOutcome => ({ ok: false, delivery: "rejected", failure });

/**
 * HTTP status to a delivery state. **Review finding 1 is why a 5xx is `unknown`
 * and not a retry.** Zoho never receives the relay's idempotency key, so it
 * cannot deduplicate: a 500 returned after the message was accepted, retried,
 * sends the customer a second copy. Only the four statuses that are definite
 * refusals are `rejected`; everything else the server says after accepting the
 * request is ambiguous, and ambiguous means a person looks in Sent.
 */
export function classify(status: number): { delivery: Delivery; failure: string } {
  if (status === 200 || status === 201) return { delivery: "sent", failure: "" };
  if (status === 400) return { delivery: "rejected", failure: "Zoho rejected the message as malformed." };
  if (status === 401) return { delivery: "rejected", failure: "The Zoho token was not accepted." };
  if (status === 403) return { delivery: "rejected", failure: "The Zoho token is not permitted to send as this address." };
  if (status === 404) return { delivery: "rejected", failure: "The Zoho account or endpoint was not found." };
  return { delivery: "unknown", failure: `Zoho returned status ${status} after the request was made.` };
}

/**
 * Zoho does not publish the success envelope, so the identifier is looked for
 * in the shapes the API uses elsewhere and **its absence is not treated as a
 * failure**. A 200 means the message left; reporting failure would have the
 * relay release the key and the office send it twice. The send is recorded
 * instead as accounted-for-by-key, which the reconciliation pass can still
 * match on.
 */
export function extractMessageId(body: string, fallbackKey: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return `unidentified:${fallbackKey}`;
  }
  const data = (parsed as { data?: unknown })?.data;
  const candidate = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
  for (const key of ["messageId", "message_id", "messageID", "msgId"]) {
    const value = candidate?.[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return `unidentified:${fallbackKey}`;
}

/** The documented request body, built from an already-validated send. */
export function buildSendBody(send: ValidatedSend): Record<string, unknown> {
  const body: Record<string, unknown> = {
    // **Review finding 9.** Zoho documents `fromAddress` as the sender address,
    // "which must belong to the authenticated account" — not an RFC 5322
    // mailbox with a display name. The display name is configured in Zoho's
    // own Send Mail As, not supplied per message. The first version sent
    // `Display Name <address>`, which was the exact mistake this client
    // criticises elsewhere: inventing a format where the documentation is
    // specific. The approved sender's display name is kept in the allowlist
    // because the relay still uses it to label the identity in the UI; it is
    // simply not part of the request.
    fromAddress: send.sender.address,
    toAddress: send.to.join(","),
    subject: send.subject,
    content: send.html ?? send.text ?? "",
    mailFormat: send.html ? "html" : "plaintext",
    askReceipt: "no",
    encoding: "UTF-8",
  };
  if (send.cc.length > 0) body.ccAddress = send.cc.join(",");
  if (send.bcc.length > 0) body.bccAddress = send.bcc.join(",");
  return body;
}

export class ZohoApiMailClient implements ZohoMailClient {
  private readonly capabilities: ZohoCapabilities;

  constructor(private readonly options: ZohoApiClientOptions) {
    this.capabilities = options.capabilities ?? NOTHING_PROVEN;
  }

  async send(send: ValidatedSend): Promise<SendOutcome> {
    // Everything refusable is refused before a token is fetched, let alone a
    // request made: an unsendable message must not consume a network call or
    // leave half a trace upstream.
    const recipientCount = send.to.length + send.cc.length + send.bcc.length;
    if (!this.capabilities.multipleRecipientsPerField && recipientCount > 1) {
      return notAttempted(REFUSALS.multipleRecipients);
    }
    if (send.inReplyTo || send.references) {
      return notAttempted(REFUSALS.threading);
    }
    if (send.attachments.length > 0) {
      return notAttempted(REFUSALS.attachments);
    }

    const token = await this.options.tokens.token();
    if (!token) return notAttempted(REFUSALS.noToken);
    if (!token.apiDomain) return notAttempted(REFUSALS.noApiDomain);
    // The api_domain arrives over the wire, so it is validated like any other
    // untrusted input before a bearer token is sent to it.
    if (!isZohoHost(token.apiDomain)) return notAttempted(REFUSALS.apiDomainNotZoho);

    const url = `${token.apiDomain.replace(/\/+$/, "")}/api/accounts/${encodeURIComponent(this.options.accountId)}/messages`;

    const attempt = await withDeadline(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS, async (signal) => {
      const response = await this.options.fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildSendBody(send)),
        signal,
      });
      return { status: response.status, text: await response.text() };
    });

    if (!attempt.ok) {
      return indeterminate(
        attempt.timedOut
          ? "The Zoho request passed its deadline, and it is not known whether the message was sent."
          : "The Zoho request did not complete, and it is not known whether the message was sent.",
      );
    }
    const { status, text } = attempt.value;

    const verdict = classify(status);
    if (verdict.delivery === "rejected") return rejected(verdict.failure);
    if (verdict.delivery === "unknown") return indeterminate(verdict.failure);

    return {
      ok: true,
      delivery: "sent",
      providerMessageId: extractMessageId(text, send.idempotencyKey),
      // Not established rather than known absent — see the header comment.
      savedToSent: false,
    };
  }
}

/**
 * Exchanges a refresh token for an access token and caches it until shortly
 * before Zoho's hour expires.
 *
 * **The refresh token is passed in and never logged.** Zoho allows a user
 * twenty refresh tokens and silently deletes the oldest when a twenty-first is
 * issued — *including one still in use* — so re-authorising repeatedly during
 * setup can revoke the deployment's own token without any error at the time.
 * That is operational, not code, and it is written here because the failure it
 * produces looks like an expired token months later.
 */
export class RefreshTokenSource implements TokenSource {
  private cached?: { token: AccessToken; expiresAt: number };

  constructor(
    private readonly options: {
      readonly accountsHost: string;
      readonly clientId: string;
      readonly clientSecret: string;
      readonly refreshToken: string;
      readonly fetch: HttpFetch;
      readonly now?: () => number;
      readonly timeoutMs?: number;
      /** Refresh this long before expiry, so a send never races the clock. */
      readonly marginMs?: number;
    },
  ) {}

  async token(): Promise<AccessToken | undefined> {
    // Refused before the secret is in a request body. A misconfigured host is
    // a configuration error, and a configuration error must not be a
    // credential disclosure.
    if (!isZohoHost(this.options.accountsHost)) return undefined;

    const now = (this.options.now ?? Date.now)();
    if (this.cached && this.cached.expiresAt > now) return this.cached.token;

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: this.options.refreshToken,
    });

    // A token call has no ambiguity to preserve: a token either arrives or it
    // does not, and nothing has been sent either way.
    const attempt = await withDeadline(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS, async (signal) => {
      const response = await this.options.fetch(
        `${this.options.accountsHost.replace(/\/+$/, "")}/oauth/v2/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: params.toString(),
          signal,
        },
      );
      return { status: response.status, text: await response.text() };
    });
    if (!attempt.ok) return undefined;
    const { status, text } = attempt.value;
    if (status !== 200) return undefined;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return undefined;
    }

    const accessToken = parsed.access_token;
    const apiDomain = parsed.api_domain;
    // Zoho answers 200 with an `error` field for a revoked token, so a token
    // is only a token if it is actually there.
    if (typeof accessToken !== "string" || accessToken.length === 0) return undefined;
    if (typeof apiDomain !== "string" || apiDomain.length === 0) return undefined;

    const expiresInSeconds = typeof parsed.expires_in === "number" ? parsed.expires_in : 3600;
    const margin = this.options.marginMs ?? 60_000;
    const token: AccessToken = { accessToken, apiDomain };
    this.cached = { token, expiresAt: now + Math.max(0, expiresInSeconds * 1000 - margin) };
    return token;
  }
}
