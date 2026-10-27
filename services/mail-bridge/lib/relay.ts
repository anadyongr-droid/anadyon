/**
 * The relay's send path, as a framework-agnostic handler.
 *
 * **The order of the checks is the design**, not an implementation detail.
 * §6.2 lists twelve steps; the sequence below puts every refusal before
 * anything irreversible, so a request that should not send cannot have sent by
 * the time it is refused:
 *
 *   1. kill switch        — an operator's "stop" must beat everything
 *   2. authentication     — no identity, no senders to resolve
 *   3. validation         — the whole boundary, including the sender allowlist
 *   4. rate limit         — counted per user, before a claim is spent
 *   5. idempotency claim  — the last gate before the irreversible step
 *   6. send               — the only irreversible step
 *   7. audit              — and a failure here blocks, see store.ts
 *   8. settle             — so a retry is answered rather than resent
 *
 * **Why the kill switch is first.** A switch that is checked after
 * authentication cannot stop an attacker who has a valid session, which is the
 * case it exists for. It is also the cheapest check, so there is no cost to
 * putting it where it belongs.
 *
 * **Why the rate limit precedes the claim.** A rejected request must not
 * consume an idempotency key. If it did, the user's retry after fixing nothing
 * would come back "already settled" and they would never see the real reason.
 */

import { validateSendRequest, type ApprovedSender, type RelayLimits, type SendRequestInput } from "./sendRequest";
import { AUDIT_FAILURE_BLOCKS_SEND, type BridgeStore } from "./store";
import type { SendOutcome, ZohoMailClient } from "./zohoClient";

export type AuthenticatedUser = {
  readonly userId: string;
  readonly approvedSenders: readonly ApprovedSender[];
};

export interface Authenticator {
  /** Resolves a bearer token to a user, or undefined. Never throws for a bad token. */
  authenticate(token: string | undefined): Promise<AuthenticatedUser | undefined>;
}

export type RelayResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

export type RelayDeps = {
  readonly auth: Authenticator;
  readonly store: BridgeStore;
  readonly zoho: ZohoMailClient;
  readonly limits: RelayLimits;
  readonly now?: () => number;
};

const json = (status: number, body: Record<string, unknown>): RelayResponse => ({ status, body });

/**
 * Never leaks an upstream message. §6.2 item 12 requires a clear result
 * "without exposing upstream secrets", and an error string from a provider is
 * exactly where a token or an internal hostname turns up.
 */
const SAFE_FAILURE = "The message could not be sent. Use Zoho webmail and report this.";

export async function handleSend(
  token: string | undefined,
  input: SendRequestInput,
  deps: RelayDeps,
): Promise<RelayResponse> {
  const now = deps.now ?? Date.now;

  // 1. Kill switch, before anything else.
  if (!(await deps.store.isSendingEnabled())) {
    return json(503, { error: "Bridge sending is disabled. Use Zoho webmail." });
  }

  // 2. Authentication.
  const user = await deps.auth.authenticate(token);
  if (!user) return json(401, { error: "Not authenticated." });

  // 3. Validation — the sender allowlist is resolved from the authenticated
  //    user, never from the request.
  const validation = validateSendRequest(input, user.approvedSenders, deps.limits);
  if (!validation.ok) return json(400, { error: "Rejected.", reasons: validation.reasons });
  const send = validation.send;

  // 4. Rate limit, before a key is spent.
  const recent = await deps.store.countRecentSends(user.userId, deps.limits.windowMs, now());
  if (recent >= deps.limits.maxSendsPerWindow) {
    return json(429, { error: "Send limit reached for this period. Use Zoho webmail." });
  }

  // 5. Idempotency.
  const claim = await deps.store.claim(send.idempotencyKey);
  if (claim.state === "in_flight") {
    return json(409, { error: "This message is already being sent.", idempotencyKey: send.idempotencyKey });
  }
  if (claim.state === "settled") {
    return claim.outcome.ok
      ? json(200, {
          sent: true,
          deduplicated: true,
          providerMessageId: claim.outcome.providerMessageId,
          savedToSent: claim.outcome.savedToSent,
        })
      : json(502, { error: SAFE_FAILURE, deduplicated: true });
  }

  // 6. The only irreversible step.
  let outcome: SendOutcome;
  try {
    outcome = await deps.zoho.send(send);
  } catch {
    // A thrown client is a retryable transport problem, not a verdict on the
    // message, so the key is released rather than settled.
    await deps.store.release(send.idempotencyKey);
    return json(502, { error: SAFE_FAILURE });
  }

  // 7. Audit. Fail closed — see AUDIT_FAILURE_BLOCKS_SEND in store.ts.
  try {
    await deps.store.appendAudit({
      idempotencyKey: send.idempotencyKey,
      userId: user.userId,
      senderAddress: send.sender.address,
      recipientCount: send.to.length + send.cc.length + send.bcc.length,
      // Length, not content: §2.2 forbids retaining bodies, and a subject is
      // body-adjacent enough that its text does not belong in an audit row.
      subjectLength: send.subject.length,
      attachmentCount: send.attachments.length,
      providerMessageId: outcome.ok ? outcome.providerMessageId : undefined,
      outcome: outcome.ok ? "sent" : "failed",
      at: now(),
    });
  } catch {
    if (AUDIT_FAILURE_BLOCKS_SEND) {
      // The message may already have left. Settling records that, so a retry
      // does not send a second copy — the user is told to verify in Zoho.
      await deps.store.settle(send.idempotencyKey, outcome);
      return json(500, {
        error:
          "The message may have been sent but could not be recorded. Check Zoho's Sent folder before resending.",
      });
    }
  }

  // 8. Settle, so a retry is answered rather than resent.
  if (!outcome.ok && outcome.retryable) {
    await deps.store.release(send.idempotencyKey);
    return json(502, { error: SAFE_FAILURE, retryable: true });
  }
  await deps.store.settle(send.idempotencyKey, outcome);

  return outcome.ok
    ? json(200, { sent: true, providerMessageId: outcome.providerMessageId, savedToSent: outcome.savedToSent })
    : json(502, { error: SAFE_FAILURE });
}

/** §6.2: list the identities permitted for this user. */
export async function handleListSenders(
  token: string | undefined,
  deps: Pick<RelayDeps, "auth">,
): Promise<RelayResponse> {
  const user = await deps.auth.authenticate(token);
  if (!user) return json(401, { error: "Not authenticated." });
  return json(200, { senders: user.approvedSenders });
}

/** §6.2: query a submitted message by idempotency key. */
export async function handleStatus(
  token: string | undefined,
  idempotencyKey: string,
  deps: Pick<RelayDeps, "auth" | "store">,
): Promise<RelayResponse> {
  const user = await deps.auth.authenticate(token);
  if (!user) return json(401, { error: "Not authenticated." });
  const outcome = await deps.store.lookup(idempotencyKey);
  if (!outcome) return json(404, { error: "No settled result for that key." });
  return outcome.ok
    ? json(200, { sent: true, providerMessageId: outcome.providerMessageId })
    : json(200, { sent: false });
}
