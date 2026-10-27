/**
 * The relay's send path, as a framework-agnostic handler.
 *
 * **The order of the checks is the design**, not an implementation detail.
 * §6.2 lists twelve steps; the sequence below puts every refusal before
 * anything irreversible, so a request that should not send cannot have sent by
 * the time it is refused:
 *
 *   1. kill switch     — an operator's "stop" must beat everything
 *   2. authentication  — no identity, no senders to resolve
 *   3. validation      — the whole boundary, including the sender allowlist
 *   4. admission       — volume limit AND idempotency claim, in ONE atomic step
 *   5. intent          — the write-ahead record; a failure here stops the send
 *   6. send            — the only irreversible step
 *   7. outcome         — update the intent with what happened
 *
 * **Why the kill switch is first.** A switch that is checked after
 * authentication cannot stop an attacker who has a valid session, which is the
 * case it exists for. It is also the cheapest check, so there is no cost to
 * putting it where it belongs.
 *
 * **Why steps 4 and 5 look different from the first version**, and this is the
 * substance of Codex's review:
 *
 * - The volume limit used to be counted and compared *before* a separate claim.
 *   Two concurrent requests with different keys both read the same count and
 *   both sent. They are now one atomic `admit` (finding 6).
 * - The audit record used to be written *after* the send, under a constant
 *   claiming it failed closed. It could not: the message had already left. The
 *   intent is now written **before** the send and a failure to write it stops
 *   the send (finding 2).
 * - A failed send used to release the key whenever a `retryable` flag was set.
 *   Zoho never receives that key, so releasing it after an ambiguous failure
 *   invites a second copy to the customer. Only a request that was **never
 *   made** releases now (finding 1) — see `Delivery` in `zohoClient.ts`.
 */

import { validateSendRequest, type ApprovedSender, type RelayLimits, type SendRequestInput } from "./sendRequest";
import { INTENT_FAILURE_BLOCKS_SEND, type BridgeStore } from "./store";
import { mayReleaseKey, type SendOutcome, type ZohoMailClient } from "./zohoClient";

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

  // 4. Admission: the volume limit and the idempotency claim as ONE atomic
  //    operation. Separating them is finding 6.
  const admission = await deps.store.admit(send.idempotencyKey, user.userId, deps.limits, now());

  if (admission.state === "rate_limited") {
    return json(429, { error: "Send limit reached for this period. Use Zoho webmail." });
  }
  if (admission.state === "in_flight") {
    return json(409, { error: "This message is already being sent.", idempotencyKey: send.idempotencyKey });
  }
  if (admission.state === "settled") {
    return settledResponse(admission.outcome, true);
  }

  const claimToken = admission.token;

  // 5. The write-ahead record. Nothing leaves without attribution.
  try {
    await deps.store.recordIntent({
      idempotencyKey: send.idempotencyKey,
      userId: user.userId,
      senderAddress: send.sender.address,
      recipientCount: send.to.length + send.cc.length + send.bcc.length,
      // Length, not content: §2.2 forbids retaining bodies, and a subject is
      // body-adjacent enough that its text does not belong in a record.
      subjectLength: send.subject.length,
      attachmentCount: send.attachments.length,
      at: now(),
    });
  } catch {
    if (INTENT_FAILURE_BLOCKS_SEND) {
      // Nothing has been sent, so the key is released and the user may retry
      // once the store is back. This is what fail-closed looks like when the
      // record precedes the irreversible step.
      await deps.store.release(send.idempotencyKey, claimToken);
      return json(503, {
        error: "Sending is unavailable because it cannot be recorded. Use Zoho webmail.",
      });
    }
  }

  // 6. The only irreversible step.
  let outcome: SendOutcome;
  try {
    outcome = await deps.zoho.send(send);
  } catch {
    // A thrown client means the request may or may not have been made, and the
    // client is supposed to classify that itself. Reaching here means it threw
    // instead, so the safe reading is the ambiguous one.
    outcome = { ok: false, delivery: "unknown", failure: SAFE_FAILURE };
  }

  // 7. Record what happened. The intent already attributes the send, so a
  //    failure here degrades the record rather than losing it.
  let outcomeRecorded = true;
  try {
    await deps.store.recordOutcome(
      {
        idempotencyKey: send.idempotencyKey,
        delivery: outcome.delivery,
        providerMessageId: outcome.ok ? outcome.providerMessageId : undefined,
        at: now(),
      },
      claimToken,
    );
  } catch {
    outcomeRecorded = false;
  }

  // Only a request that was never made frees the key. An ambiguous result keeps
  // it, so no automatic retry can produce a second copy.
  if (!outcome.ok && mayReleaseKey(outcome)) {
    await deps.store.release(send.idempotencyKey, claimToken);
    return json(502, { error: outcome.failure, retryable: true });
  }

  if (!outcomeRecorded) {
    return json(500, {
      error:
        "The message may have been sent but the result could not be recorded. Check Zoho's Sent folder before resending.",
      delivery: outcome.delivery,
    });
  }

  return settledResponse(outcome, false);
}

/**
 * One place that turns an outcome into a response, so a fresh send and a
 * deduplicated retry cannot answer differently.
 */
function settledResponse(outcome: SendOutcome, deduplicated: boolean): RelayResponse {
  if (outcome.ok) {
    return json(200, {
      sent: true,
      ...(deduplicated ? { deduplicated: true } : {}),
      providerMessageId: outcome.providerMessageId,
      savedToSent: outcome.savedToSent,
    });
  }
  if (outcome.delivery === "unknown") {
    // Never answered 200, and never with `sent`. The caller must not be able to
    // read this as a success — review finding 4 is the same mistake one layer up.
    return json(502, {
      error: "The message may have been sent. Check Zoho's Sent folder before resending.",
      delivery: "unknown",
      ...(deduplicated ? { deduplicated: true } : {}),
    });
  }
  return json(502, {
    error: SAFE_FAILURE,
    delivery: outcome.delivery,
    ...(deduplicated ? { deduplicated: true } : {}),
  });
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
  const outcome = await deps.store.lookup(idempotencyKey, user.userId);
  if (!outcome) return json(404, { error: "No settled result for that key." });
  return outcome.ok
    ? json(200, { sent: true, providerMessageId: outcome.providerMessageId })
    : json(200, { sent: false });
}
