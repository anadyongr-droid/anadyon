/**
 * Idempotency, rate limiting and the kill switch.
 *
 * **The property that matters, and the bug it is easy to write.** §6.2 item 8
 * makes an idempotency key the defence against a double click sending twice.
 * The naive implementation reads the key, sees nothing, and sends — which
 * races with the second click doing the same. So the reservation is a single
 * operation that both tests and claims the key, and the caller is told which
 * of the three states it got: it owns the send, someone else is mid-send, or
 * the send already finished and here is what happened.
 *
 * **Why an interface with an in-memory implementation.** Stage 1 has no
 * database. The semantics are the hard part and they can be pinned down now;
 * the durable implementation substitutes later without the relay changing.
 * `claim` is written as the single atomic operation a real backing store must
 * provide — `INSERT ... ON CONFLICT DO NOTHING` in Postgres, a conditional put
 * elsewhere. Anything that cannot do that atomically is not a usable store
 * here, and that is a constraint on the choice rather than a detail of it.
 */

import type { SendOutcome } from "./zohoClient";

export type ClaimResult =
  /** This caller owns the send and must proceed. */
  | { readonly state: "claimed" }
  /** Another request holds this key and has not finished. Do not send. */
  | { readonly state: "in_flight" }
  /** The send already completed. Return this, do not send again. */
  | { readonly state: "settled"; readonly outcome: SendOutcome };

export type AuditRecord = {
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly senderAddress: string;
  readonly recipientCount: number;
  readonly subjectLength: number;
  readonly attachmentCount: number;
  readonly providerMessageId?: string;
  readonly outcome: "sent" | "failed";
  readonly at: number;
};

export interface BridgeStore {
  /**
   * Atomically test-and-claim, **for one owner**. See ClaimResult.
   *
   * The owner is part of the operation rather than a later filter because the
   * three states each carry information: a key claimed by a different user
   * answers `in_flight`, which refuses without saying whether that key was
   * ever sent or to whom. Scoping it afterwards would mean having already
   * read someone else's outcome.
   */
  claim(idempotencyKey: string, userId: string): Promise<ClaimResult>;
  /** Record the result against a claimed key, so a retry is answered not resent. */
  settle(idempotencyKey: string, outcome: SendOutcome): Promise<void>;
  /**
   * Release a claim so a retry may proceed. Only for a retryable failure: a
   * permanent failure is settled instead, so the user is told the same thing
   * every time rather than being invited to retry forever.
   */
  release(idempotencyKey: string): Promise<void>;
  /** Sends by this user inside the window. */
  countRecentSends(userId: string, windowMs: number, now: number): Promise<number>;
  /** Append an audit record. Throwing here must block the send — see below. */
  appendAudit(record: AuditRecord): Promise<void>;
  /** The kill switch. False means refuse every send. */
  isSendingEnabled(): Promise<boolean>;
  /**
   * The settled outcome for this user's key, or undefined — including when the
   * key exists and belongs to someone else, which is indistinguishable from
   * not existing on purpose.
   */
  lookup(idempotencyKey: string, userId: string): Promise<SendOutcome | undefined>;
}

/**
 * **Decision, recorded because §17 question 13 asks it and leaves it open:
 * audit-store unavailability BLOCKS sending.**
 *
 * The alternative is a send that went out as `customerservice@anadyon.gr` with
 * no record of who sent it. The whole justification for a relay over Gmail's
 * own sender is attribution — §2.2 requires *"individual staff identity, MFA
 * and attribution for every bridge send"* — so a send nobody can be held to is
 * the one outcome worse than a send that did not happen. Zoho webmail is the
 * documented fallback and it is always available.
 */
export const AUDIT_FAILURE_BLOCKS_SEND = true;

type Entry =
  | { state: "in_flight"; userId: string; at: number }
  | { state: "settled"; userId: string; outcome: SendOutcome; at: number };

/** Stage 1 only. Loses everything on restart, which is why it is not Stage 2. */
export class InMemoryBridgeStore implements BridgeStore {
  private readonly entries = new Map<string, Entry>();
  private readonly sends: { userId: string; at: number }[] = [];
  readonly audit: AuditRecord[] = [];
  private sendingEnabled = true;
  /** Set to make appendAudit throw, so the fail-closed path can be tested. */
  auditBroken = false;

  async claim(idempotencyKey: string, userId: string): Promise<ClaimResult> {
    const existing = this.entries.get(idempotencyKey);
    // Another user's key is refused as in-flight: a refusal that says nothing.
    if (existing && existing.userId !== userId) return { state: "in_flight" };
    if (existing?.state === "settled") return { state: "settled", outcome: existing.outcome };
    if (existing?.state === "in_flight") return { state: "in_flight" };
    // Single synchronous set: nothing can interleave between the get and this
    // in one JS event-loop turn, which is what makes the Map version honest
    // about the atomicity a real store must provide.
    this.entries.set(idempotencyKey, { state: "in_flight", userId, at: Date.now() });
    return { state: "claimed" };
  }

  async settle(idempotencyKey: string, outcome: SendOutcome): Promise<void> {
    const existing = this.entries.get(idempotencyKey);
    // Settling a key nobody claimed would create an unowned record, so the
    // owner is carried over and an unclaimed key is left alone.
    if (!existing) return;
    this.entries.set(idempotencyKey, { state: "settled", userId: existing.userId, outcome, at: Date.now() });
  }

  async release(idempotencyKey: string): Promise<void> {
    const existing = this.entries.get(idempotencyKey);
    if (existing?.state === "in_flight") this.entries.delete(idempotencyKey);
  }

  async countRecentSends(userId: string, windowMs: number, now: number): Promise<number> {
    return this.sends.filter((s) => s.userId === userId && now - s.at < windowMs).length;
  }

  async appendAudit(record: AuditRecord): Promise<void> {
    if (this.auditBroken) throw new Error("audit store unavailable");
    this.audit.push(record);
    if (record.outcome === "sent") this.sends.push({ userId: record.userId, at: record.at });
  }

  async isSendingEnabled(): Promise<boolean> {
    return this.sendingEnabled;
  }

  async lookup(idempotencyKey: string, userId: string): Promise<SendOutcome | undefined> {
    const existing = this.entries.get(idempotencyKey);
    if (!existing || existing.userId !== userId) return undefined;
    return existing.state === "settled" ? existing.outcome : undefined;
  }

  /** The kill switch, as an operator would use it. */
  setSendingEnabled(enabled: boolean): void {
    this.sendingEnabled = enabled;
  }
}
