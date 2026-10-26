/**
 * The Zoho send call, behind an interface — and the interface exists because
 * the answers Stage 1 needs are not yet known.
 *
 * **What is unresolved, from the proposal's own §17.** Whether
 * `ZohoMail.messages.CREATE` alone can send as an alias, preserve
 * `In-Reply-To`/`References`, carry attachments and save a complete copy to
 * Sent. Those need a Zoho OAuth client and a non-production address, so they
 * are Tasos's to answer. Everything above this interface is written so that
 * only the implementation below changes once they are.
 *
 * **Why there is no implementation here yet.** Writing one would mean guessing
 * the request shape and the scope's limits, and a guess that compiles looks
 * like knowledge. The fake is enough to build and test the relay; the real
 * client is a Stage 1 task with credentials in hand.
 */

import type { ValidatedSend } from "./sendRequest";

export type SendOutcome =
  | {
      readonly ok: true;
      /** Zoho's identifier, needed for the audit record and for retries. */
      readonly providerMessageId: string;
      /** Whether a copy was saved to Sent — §17 question 6, unverified. */
      readonly savedToSent: boolean;
    }
  | {
      readonly ok: false;
      /** Safe to show a user. Never carries upstream secrets. */
      readonly failure: string;
      /** True when retrying the same idempotency key could succeed. */
      readonly retryable: boolean;
    };

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
  constructor(private readonly outcome: SendOutcome = { ok: true, providerMessageId: "fake-1", savedToSent: true }) {}
  async send(send: ValidatedSend): Promise<SendOutcome> {
    this.sent.push(send);
    return this.outcome;
  }
}
