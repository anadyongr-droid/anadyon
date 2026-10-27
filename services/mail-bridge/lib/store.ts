/**
 * Idempotency, admission, the write-ahead audit and the kill switch.
 *
 * **This file was rewritten on 27 October after Codex's review**, which upheld
 * three findings against it. Each is recorded here rather than in a commit
 * message alone, because each was a control that looked present and was not.
 *
 * **Finding 2 — the audit was not fail-closed.** The first version appended an
 * audit record *after* the send, and a constant called
 * `AUDIT_FAILURE_BLOCKS_SEND` asserted it failed closed. It did not: the
 * irreversible step had already happened, so an audit failure meant a message
 * had left `customerservice@anadyon.gr` with no durable record of who sent it —
 * exactly the outcome §2.2's attribution requirement exists to prevent. Writing
 * the intent *before* the send is the only ordering that can fail closed, so
 * the store now has two operations: `recordIntent`, which must succeed before
 * anything leaves, and `recordOutcome`, which updates it afterwards. If
 * `recordIntent` throws, nothing is sent. If `recordOutcome` throws, the send
 * is still attributable — the intent row names the actor, the sender and the
 * time — and the row is simply left pending, which the reconciliation pass can
 * see.
 *
 * **Finding 6 — the rate limit was not atomic with admission.** The relay
 * counted recent sends, compared, and then claimed the key. Two concurrent
 * requests with different keys both read the same count and both sent. So
 * counting is no longer a separate operation: `admit` performs the volume check
 * and the key claim as **one** atomic step and returns `rate_limited` as a
 * fourth state. A store that cannot do that in one operation is not usable
 * here, and that is a constraint on choosing one rather than a detail.
 *
 * **Finding 7 — a claim could be stranded, and anyone could release it.** A
 * process dying between claim and settle left the key `in_flight` forever, so
 * every retry got 409 and that message could never be sent again. And `release`
 * took only the key, so a stale worker could release a claim another worker
 * then held. `admit` therefore returns a **fencing token** that
 * `recordOutcome` and `release` require, which is what makes "my claim"
 * meaningful.
 *
 * **Re-review finding 1 — and the first fix for finding 7 was worse than the
 * bug.** That fix also made an expired claim *re-admittable*, so a lease
 * timeout automatically permitted a second send. The earlier worker may still
 * be running, may already have reached Zoho, or may have sent successfully and
 * failed only to record it — and a fencing token is local, so **Zoho has no
 * idea the second send is a duplicate**. That is the same defect as finding 1,
 * reintroduced through the mechanism meant to close finding 7. Worse, the test
 * written for it started a stalled provider call and then asserted that a
 * second send was admitted: a test asserting the bug, which is the failure
 * mode this project has now hit three times.
 *
 * So **an expired claim is never re-admitted**. It is settled as
 * `delivery: "unknown"` — the state that already exists for exactly this
 * situation — and the caller is told a previous attempt's fate is unknown and
 * to check Zoho's Sent folder. Finding 7's "stranded forever" is still fixed,
 * because the key now reaches a definite answer rather than silence; what is
 * no longer true is that the answer is "go ahead and send again". If the
 * message is not in Sent, a person composes it again under a new key, which is
 * a decision rather than an automatic duplicate.
 *
 * **What a real store must provide**, stated so the Stage 2 choice is
 * constrained rather than guessed: one atomic conditional write that inserts a
 * claim only if no live claim exists *and* the user is under their limit. In
 * Postgres that is a single statement with a `where not exists` on both
 * conditions; anything needing two round trips reintroduces finding 6.
 */

import type { SendOutcome } from "./zohoClient";
import type { RelayLimits } from "./sendRequest";

/** Proof that the holder owns a claim. Checked on settle and release. */
export type FencingToken = string;

export type InspectResult =
  /** No claim by this user for this key. Safe to read as "never submitted". */
  | { readonly state: "unknown_key" }
  /** Claimed and not finished. **Not** safe to read as "not sent". */
  | { readonly state: "in_flight" }
  | { readonly state: "settled"; readonly outcome: SendOutcome };

export type AdmitResult =
  /** This caller owns the send and must proceed. The token proves it. */
  | { readonly state: "claimed"; readonly token: FencingToken }
  /** A live claim is held by this user and has not finished. Do not send. */
  | { readonly state: "in_flight" }
  /** The send already completed. Return this, do not send again. */
  | { readonly state: "settled"; readonly outcome: SendOutcome }
  /** Over the volume limit. Checked in the same operation as the claim. */
  | { readonly state: "rate_limited" };

/**
 * Written **before** the send. Carries everything attribution needs, and
 * nothing that would make it a copy of the message: a recipient count rather
 * than addresses, a subject length rather than a subject.
 */
export type IntentRecord = {
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly senderAddress: string;
  readonly recipientCount: number;
  readonly subjectLength: number;
  readonly attachmentCount: number;
  readonly at: number;
};

/** Written after, against an intent that already exists. */
export type OutcomeRecord = {
  readonly idempotencyKey: string;
  readonly delivery: SendOutcome["delivery"];
  readonly providerMessageId?: string;
  readonly at: number;
};

export interface BridgeStore {
  /**
   * Atomically: check the user's volume against `limits`, and claim the key if
   * they are under it. One operation — see finding 6 above.
   */
  admit(idempotencyKey: string, userId: string, limits: RelayLimits, now: number): Promise<AdmitResult>;
  /**
   * The write-ahead record. **Must succeed before anything is sent**; a throw
   * here stops the send.
   */
  recordIntent(record: IntentRecord): Promise<void>;
  /**
   * Updates the intent with what happened, and settles the key — **except for
   * `not_attempted`, which settles nothing**, because no request was made and
   * the caller is about to release the claim.
   *
   * **Settles once.** Throws for a stale token and for a key already settled,
   * including one settled by its own lease expiring: a late "it did send"
   * would overwrite an `unknown` the user has already been told to resolve by
   * hand, hiding a possible duplicate instead of clearing it.
   */
  recordOutcome(record: OutcomeRecord, token: FencingToken): Promise<void>;
  /**
   * Release a claim so a retry may proceed — **only** for a request that was
   * never made. See `mayReleaseKey`. Requires the fencing token, and withdraws
   * **that admission** from the volume count rather than an arbitrary one
   * belonging to the same user.
   */
  release(idempotencyKey: string, token: FencingToken): Promise<void>;
  /** The kill switch, read at runtime on every send. False means refuse. */
  isSendingEnabled(): Promise<boolean>;
  /**
   * The full state of this user's key.
   *
   * **This replaced a `lookup` that returned the settled outcome or
   * `undefined`, and the replacement is the point.** `lookup` could not tell a
   * key nobody had ever claimed from one mid-send, so `handleStatus` answered
   * 404 to both and a person checking on a send in progress was told it did not
   * exist. Distinguishing them is the difference between "wait" and "it never
   * happened", and only one of those is safe to act on.
   *
   * `lookup` was then **deleted rather than left in place**: a mutation sweep
   * showed its user-scoping check was unreachable once nothing called it, and
   * an unreachable security check is worse than none — it reads as protection
   * while protecting nothing.
   *
   * **It takes `now` because it must evaluate the lease, and the first version
   * did not.** Codex's third review: expiry was checked only inside `admit`, so
   * a worker that crashed mid-send left `inspect` answering `in_flight`
   * forever — and `handleStatus` turns that into *"still being sent, wait
   * rather than resending"*. A message nobody will ever send, telling the
   * office to keep waiting, indefinitely. Both operations now resolve an
   * expired claim the same way, through `resolveExpired`.
   */
  inspect(idempotencyKey: string, userId: string, now: number): Promise<InspectResult>;
}

/**
 * **Decision, recorded because §17 question 13 asks it and leaves it open: a
 * failure to write the intent BLOCKS sending.**
 *
 * The alternative is a send that went out as `customerservice@anadyon.gr` with
 * no record of who sent it. The whole justification for a relay over Gmail's
 * own sender is attribution — §2.2 requires *"individual staff identity, MFA
 * and attribution for every bridge send"* — so a send nobody can be held to is
 * the one outcome worse than a send that did not happen. Zoho webmail is the
 * documented fallback and it is always available.
 *
 * Renamed from `AUDIT_FAILURE_BLOCKS_SEND`, which named a true intention about
 * code that could not deliver it.
 */
export const INTENT_FAILURE_BLOCKS_SEND = true;

/**
 * How long a claim may be held before it is considered abandoned — at which
 * point it is **resolved as unknown, not re-admitted**. Long enough that a slow
 * Zoho call is not declared unknown underneath itself; short enough that a
 * crashed worker gets a definite answer rather than silence.
 */
export const DEFAULT_CLAIM_LEASE_MS = 2 * 60 * 1000;

/** What a claim that outlived its lease settles to. */
export const EXPIRED_CLAIM_OUTCOME: SendOutcome = Object.freeze({
  ok: false,
  delivery: "unknown",
  failure:
    "A previous attempt to send this message did not finish, and it is not known whether it was sent. Check Zoho's Sent folder before composing it again.",
});

type Entry = {
  state: "in_flight" | "settled";
  userId: string;
  token: FencingToken;
  claimedAt: number;
  outcome?: SendOutcome;
};

/**
 * One admission, tied to the key that caused it. **Re-review finding 2:** the
 * first version stored only `{userId, at}` and `release` removed the *first*
 * admission for that user — which is usually a completed send, not the attempt
 * being withdrawn. So releasing a never-attempted request discounted somebody's
 * successful send from the rolling window and left the failed reservation
 * counted, undercounting the limit in both directions at once.
 */
type Admission = { userId: string; idempotencyKey: string; token: FencingToken; at: number };

/** Stage 1 only. Loses everything on restart, which is why it is not Stage 2. */
export class InMemoryBridgeStore implements BridgeStore {
  private readonly entries = new Map<string, Entry>();
  /** Every attempt admitted, which is what the volume limit counts. */
  private readonly admitted: Admission[] = [];
  readonly intents: IntentRecord[] = [];
  readonly outcomes: OutcomeRecord[] = [];
  private sendingEnabled = true;
  /** Set to make recordIntent throw, so the fail-closed path can be tested. */
  intentBroken = false;
  /** Set to make recordOutcome throw. */
  outcomeBroken = false;

  constructor(private readonly leaseMs: number = DEFAULT_CLAIM_LEASE_MS) {}

  private nextToken = 0;

  /**
   * Settles a claim that outlived its lease, and reports whether it did.
   *
   * **One place, used by both `admit` and `inspect`**, because the two
   * disagreeing is precisely the defect Codex's third review found: expiry
   * evaluated on the send path only, so a status read of a crashed send said
   * `in_flight` for ever.
   *
   * An expired claim is **resolved as unknown, never re-admitted**: the
   * previous worker may already have reached Zoho, and Zoho cannot deduplicate
   * what it never received a key for.
   */
  private resolveExpired(idempotencyKey: string, entry: Entry, now: number): boolean {
    if (entry.state !== "in_flight") return false;
    if (now - entry.claimedAt < this.leaseMs) return false;
    this.entries.set(idempotencyKey, { ...entry, state: "settled", outcome: EXPIRED_CLAIM_OUTCOME });
    return true;
  }

  async admit(
    idempotencyKey: string,
    userId: string,
    limits: RelayLimits,
    now: number,
  ): Promise<AdmitResult> {
    const existing = this.entries.get(idempotencyKey);

    if (existing) {
      // Another user's key is refused as in-flight: a refusal that says nothing
      // about whether it was sent, or to whom.
      if (existing.userId !== userId) return { state: "in_flight" };
      if (existing.state === "settled") return { state: "settled", outcome: existing.outcome! };
      if (!this.resolveExpired(idempotencyKey, existing, now)) return { state: "in_flight" };
      return { state: "settled", outcome: EXPIRED_CLAIM_OUTCOME };
    }

    // The volume check and the claim are one operation, so two concurrent
    // requests cannot both read the same count and both proceed.
    const recent = this.admitted.filter((a) => a.userId === userId && now - a.at < limits.windowMs).length;
    if (recent >= limits.maxSendsPerWindow) return { state: "rate_limited" };

    const token = `t${++this.nextToken}`;
    this.entries.set(idempotencyKey, { state: "in_flight", userId, token, claimedAt: now });
    this.admitted.push({ userId, idempotencyKey, token, at: now });
    return { state: "claimed", token };
  }

  async recordIntent(record: IntentRecord): Promise<void> {
    if (this.intentBroken) throw new Error("intent store unavailable");
    this.intents.push(record);
  }

  async recordOutcome(record: OutcomeRecord, token: FencingToken): Promise<void> {
    if (this.outcomeBroken) throw new Error("outcome store unavailable");
    const existing = this.entries.get(record.idempotencyKey);
    // A stale worker must not settle a claim somebody else now holds.
    if (!existing || existing.token !== token) throw new Error("stale fencing token");
    // **Settle once.** A worker whose lease expired may come back with a
    // definite answer, and recording it would be better information than
    // `unknown` — but by then the user has been told to check Sent and may
    // already have composed a replacement, so overwriting the unknown with
    // "sent" would hide a possible duplicate rather than resolve it. The
    // reconciliation pass is where a late answer belongs; see reconcile.ts.
    if (existing.state === "settled") throw new Error("already settled, fencing refused");
    this.outcomes.push(record);
    // A request that was never made settles nothing: the claim stays live so
    // the caller can release it and the user can try again. Settling here
    // instead would answer the retry "already settled" with a failure the user
    // never caused — found by the test for exactly that retry.
    if (record.delivery === "not_attempted") return;
    this.entries.set(record.idempotencyKey, {
      ...existing,
      state: "settled",
      outcome: outcomeFor(record),
    });
  }

  async release(idempotencyKey: string, token: FencingToken): Promise<void> {
    const existing = this.entries.get(idempotencyKey);
    if (!existing || existing.token !== token) return;
    if (existing.state === "in_flight") {
      this.entries.delete(idempotencyKey);
      // The attempt is withdrawn from the volume count too: a request that was
      // never made should not spend the user's hourly allowance. Matched on the
      // key AND the token, so it removes its own admission — re-review finding
      // 2 was that matching on the user alone removed somebody's completed
      // send instead.
      const i = this.admitted.findIndex((a) => a.idempotencyKey === idempotencyKey && a.token === token);
      if (i >= 0) this.admitted.splice(i, 1);
    }
  }

  async isSendingEnabled(): Promise<boolean> {
    return this.sendingEnabled;
  }

  async inspect(idempotencyKey: string, userId: string, now: number): Promise<InspectResult> {
    const existing = this.entries.get(idempotencyKey);
    // Another user's key reads as unknown, exactly as it does everywhere else:
    // a refusal that discloses nothing.
    if (!existing || existing.userId !== userId) return { state: "unknown_key" };
    if (this.resolveExpired(idempotencyKey, existing, now)) {
      return { state: "settled", outcome: EXPIRED_CLAIM_OUTCOME };
    }
    if (existing.state === "in_flight") return { state: "in_flight" };
    return { state: "settled", outcome: existing.outcome! };
  }

  /** The kill switch, as an operator would use it. */
  setSendingEnabled(enabled: boolean): void {
    this.sendingEnabled = enabled;
  }
}

/** Reconstructs a stored outcome from the record written for it. */
function outcomeFor(record: OutcomeRecord): SendOutcome {
  if (record.delivery === "sent") {
    return {
      ok: true,
      delivery: "sent",
      providerMessageId: record.providerMessageId ?? "",
      savedToSent: false,
    };
  }
  return {
    ok: false,
    delivery: record.delivery,
    failure:
      record.delivery === "unknown"
        ? "The message may have been sent. Check Zoho's Sent folder before resending."
        : "The message was refused.",
  };
}
