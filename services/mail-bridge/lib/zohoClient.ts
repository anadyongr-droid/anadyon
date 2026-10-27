/**
 * The Zoho send call, behind an interface.
 *
 * **The outcome type is the important part of this file**, and it is the shape
 * Codex's review finding 1 forced. The first version had `ok: false` plus a
 * `retryable` boolean, and the relay released the idempotency key whenever
 * `retryable` was true. That is wrong, and the comment justifying it was wrong
 * in a specific way worth keeping on the record: it said retrying was safe
 * *"because the relay holds an idempotency key"*. **Zoho never receives that
 * key.** The key stops the relay processing one request twice; it does nothing
 * about a message Zoho already accepted before the connection dropped. So a
 * timeout, a reset or a 5xx after the request was sent could send the customer
 * two copies.
 *
 * Hence four delivery states rather than a boolean, and the distinction that
 * matters is **not** "should we retry" but **"do we know whether it left"**:
 *
 * - `sent` — Zoho accepted it and said so.
 * - `not_attempted` — the request was never made. Nothing is in flight, so the
 *   key may be released and the user may try again freely.
 * - `rejected` — Zoho answered with a definite refusal. Not sent, and retrying
 *   the same message will be refused again, so the key is settled rather than
 *   released.
 * - `unknown` — **the request was made and we cannot tell what happened.** The
 *   message may be in the customer's inbox. The key is settled, never released,
 *   and the user is told to look in Zoho's Sent folder before resending. This
 *   state exists to make a duplicate impossible without a person deciding to
 *   cause one.
 *
 * `unknown` is deliberately the default for anything ambiguous. An automatic
 * retry is a convenience; a second copy of a reservation email to a customer is
 * not recoverable.
 */

import type { ValidatedSend } from "./sendRequest";

/** Whether the message left, as far as we can tell. See the header comment. */
export type Delivery = "sent" | "not_attempted" | "rejected" | "unknown";

export type SendOutcome =
  | {
      readonly ok: true;
      readonly delivery: "sent";
      /** Zoho's identifier, needed for the audit record and for reconciliation. */
      readonly providerMessageId: string;
      /** Whether a copy was saved to Sent — §17 question 6, unverified. */
      readonly savedToSent: boolean;
    }
  | {
      readonly ok: false;
      readonly delivery: "not_attempted" | "rejected" | "unknown";
      /** Safe to show a user. Never carries upstream secrets. */
      readonly failure: string;
    };

/**
 * Only a request that was never made may be retried automatically. A rejection
 * will be rejected again; an unknown may already have been delivered.
 */
export function mayReleaseKey(outcome: SendOutcome): boolean {
  return outcome.ok === false && outcome.delivery === "not_attempted";
}

/** Whether the user must be told to check Sent before trying again. */
export function needsManualCheck(outcome: SendOutcome): boolean {
  return outcome.ok === false && outcome.delivery === "unknown";
}

export interface ZohoMailClient {
  send(send: ValidatedSend): Promise<SendOutcome>;
}

/**
 * Records what it was asked to send and returns a fixed result. Used by the
 * relay's tests so that the relay can be exercised without a network, a token
 * or a Zoho plan.
 */
export class FakeZohoMailClient implements ZohoMailClient {
  readonly sent: ValidatedSend[] = [];
  constructor(
    private readonly outcome: SendOutcome = {
      ok: true,
      delivery: "sent",
      providerMessageId: "fake-1",
      savedToSent: true,
    },
  ) {}
  async send(send: ValidatedSend): Promise<SendOutcome> {
    this.sent.push(send);
    return this.outcome;
  }
}
