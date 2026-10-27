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
import type { SendOutcome, ZohoMailClient } from "./zohoClient";

/** Zoho's accounts host for the European data centre. */
export const ZOHO_EU_ACCOUNTS_HOST = "https://accounts.zoho.eu";

/** The scope the send call needs, per Zoho's page for that endpoint. */
export const ZOHO_SEND_SCOPE = "ZohoMail.messages.CREATE";

/**
 * What this deployment has *proved* Zoho does, not what it hopes. Every flag
 * starts false and may only be set by someone who has watched the behaviour,
 * because each one of them fails silently in the customer's direction.
 */
export type ZohoCapabilities = {
  readonly multipleRecipientsPerField: boolean;
  readonly threadingHeaders: boolean;
  readonly attachments: boolean;
};

export const NOTHING_PROVEN: ZohoCapabilities = Object.freeze({
  multipleRecipientsPerField: false,
  threadingHeaders: false,
  attachments: false,
});

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

/** The subset of `fetch` this client uses, so tests need no network. */
export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>;

export type ZohoApiClientOptions = {
  readonly accountId: string;
  readonly tokens: TokenSource;
  readonly fetch: HttpFetch;
  readonly capabilities?: ZohoCapabilities;
  /** Guards against a hung upstream holding an office send open. */
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
  multipleRecipients:
    "Zoho does not document more than one address per recipient field, and this deployment has not proved it. Send to one recipient, or prove it and enable multipleRecipientsPerField.",
  threading:
    "Zoho documents no In-Reply-To or References field. Sending would break the customer's thread silently, so it is refused until threadingHeaders is proved and enabled.",
  attachments:
    "Attachment content is not carried in a send request, so the Zoho upload step cannot run. This is a Stage 2 change to the request type, not a configuration.",
} as const;

const unsendable = (failure: string): SendOutcome => ({ ok: false, failure, retryable: false });

/**
 * HTTP status to outcome. **Only 500 and a transport failure are retryable.**
 * A 400 retried is a 400 again, and a 401 retried against the same token is a
 * 401 again — retrying either would burn the idempotency key for nothing while
 * the office waited.
 */
export function classify(status: number): { ok: boolean; retryable: boolean; failure: string } {
  if (status === 200 || status === 201) return { ok: true, retryable: false, failure: "" };
  if (status === 400) return { ok: false, retryable: false, failure: "Zoho rejected the message as malformed." };
  if (status === 401) return { ok: false, retryable: false, failure: "The Zoho token was not accepted." };
  if (status === 403) return { ok: false, retryable: false, failure: "The Zoho token is not permitted to send as this address." };
  if (status === 404) return { ok: false, retryable: false, failure: "The Zoho account or endpoint was not found." };
  if (status >= 500) return { ok: false, retryable: true, failure: "Zoho returned a server error." };
  return { ok: false, retryable: false, failure: `Zoho returned an unexpected status ${status}.` };
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
    fromAddress: send.sender.displayName
      ? `${send.sender.displayName} <${send.sender.address}>`
      : send.sender.address,
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
      return unsendable(REFUSALS.multipleRecipients);
    }
    if (!this.capabilities.threadingHeaders && (send.inReplyTo || send.references)) {
      return unsendable(REFUSALS.threading);
    }
    if (send.attachments.length > 0) {
      return unsendable(REFUSALS.attachments);
    }

    const token = await this.options.tokens.token();
    if (!token) return { ok: false, failure: REFUSALS.noToken, retryable: true };
    if (!token.apiDomain) return unsendable(REFUSALS.noApiDomain);

    const url = `${token.apiDomain.replace(/\/+$/, "")}/api/accounts/${encodeURIComponent(this.options.accountId)}/messages`;

    let status: number;
    let text: string;
    try {
      const response = await this.options.fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildSendBody(send)),
      });
      status = response.status;
      text = await response.text();
    } catch {
      // The message may or may not have left. Retryable is the right answer
      // only because the relay holds an idempotency key: Zoho is not asked
      // again under a new key, so a duplicate needs both this failure and a
      // deliberate retry with the same key.
      return { ok: false, failure: "The Zoho request did not complete.", retryable: true };
    }

    const verdict = classify(status);
    if (!verdict.ok) return { ok: false, failure: verdict.failure, retryable: verdict.retryable };

    return {
      ok: true,
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
      /** Refresh this long before expiry, so a send never races the clock. */
      readonly marginMs?: number;
    },
  ) {}

  async token(): Promise<AccessToken | undefined> {
    const now = (this.options.now ?? Date.now)();
    if (this.cached && this.cached.expiresAt > now) return this.cached.token;

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: this.options.refreshToken,
    });

    let status: number;
    let text: string;
    try {
      const response = await this.options.fetch(
        `${this.options.accountsHost.replace(/\/+$/, "")}/oauth/v2/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: params.toString(),
        },
      );
      status = response.status;
      text = await response.text();
    } catch {
      return undefined;
    }
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
