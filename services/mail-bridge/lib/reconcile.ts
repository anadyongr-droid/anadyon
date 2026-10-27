/**
 * The HIGH 2 detector: does the office's record actually contain the mail the
 * bridge sent?
 *
 * **What HIGH 2 says, and why a one-off check is not an answer.** §4.2 of the
 * proposal makes the office's record of outbound reservation mail depend on a
 * Zoho outgoing filter BCCing Gmail. Auto BCC does not apply to external
 * IMAP/POP clients and it is unproven for every workflow. If it fails to fire
 * for a path somebody actually uses — the Zoho mobile app being the obvious
 * candidate — the office record is **quietly incomplete** and nothing says so.
 * Replies to customers exist and the office cannot see them.
 *
 * The review's objection was not that this might happen but that **verifying
 * it once at pilot time is the same mistake this project has now made five
 * times**: an instrument that reports success because it asked the easy
 * question. The staging reset counted fixture rows and never asked whether the
 * seed could price, so a staging environment unable to quote would have passed.
 *
 * **So the one rule this module is built around: a comparison with nothing in
 * it is never `ok`.** It is `inconclusive`, which is a different word on
 * purpose, and three distinct situations produce it:
 *
 * - no audited send in the window — a quiet night and a broken audit store look
 *   identical from here, and neither proves the BCC works;
 * - every audited send unmatchable, because no usable correlation identifier
 *   was recorded;
 * - a mailbox listing that failed, which the caller reports by passing
 *   `listingFailed` rather than an empty array. An empty array means *the
 *   mailbox is empty*; a failed listing means *we do not know*, and conflating
 *   the two is how a detector reports all-clear during an outage.
 *
 * `ok` therefore requires at least one send **matched on both sides**. A
 * detector that cannot find evidence does not get to say everything is fine.
 *
 * **The canary, which is what makes a quiet day checkable.** Because `ok`
 * needs a matched send, a week with no outbound office mail would never
 * confirm the path. So the intended operation is one deliberate probe send per
 * run, to an address the office controls, whose correlation id is passed as
 * `canaryCorrelationId`. A canary that is not in both listings is `diverged`
 * outright, regardless of what the rest of the window shows: it is the one
 * message whose absence has no innocent explanation.
 *
 * **The correlation identifier is the unresolved part, and it is named rather
 * than assumed.** Three candidates, none verified:
 *
 * 1. **Zoho's `messageId` from the send response** — present in the audit row
 *    already, but it is Zoho's internal identifier and whether it appears in a
 *    Sent listing, let alone in the Gmail copy, is unverified.
 * 2. **The RFC `Message-ID` header** — the BCC'd copy is the same message, so
 *    it should carry the same one. But Zoho's documented send API neither
 *    accepts nor returns it, so the relay cannot know it at send time.
 * 3. **A header the relay sets itself** — the robust answer, and unavailable:
 *    Zoho's documented body has no field for a custom header, which is the
 *    same gap that blocks `In-Reply-To` (see `zohoApi.ts`).
 *
 * This module therefore takes the identifier as data and does not care which
 * one it is. **Choosing it is a Stage 2 task with credentials in hand**, and
 * until then the detector runs against whatever the audit row holds and
 * reports `unmatchable` honestly — which is itself the finding, not a defect
 * in the detector.
 *
 * And one consequence of our own privacy decision, recorded because it is
 * easy to mistake for an oversight: the audit row stores `subjectLength` and
 * not the subject, so **matching by subject is deliberately impossible**. That
 * was the right call under §2.2 and it costs the easy correlation key.
 */

/** A send the relay believes succeeded. */
export type AuditedSend = {
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly senderAddress: string;
  /** Whatever identifier the audit row holds. Empty or `unidentified:` means unmatchable. */
  readonly correlationId: string;
  readonly at: number;
};

/** One message as a mailbox listing reports it. */
export type MailboxMessage = {
  readonly correlationId: string;
  readonly at: number;
};

/**
 * A listing, or the explicit fact that listing failed. The second case exists
 * so that "the mailbox is empty" and "we could not ask" are never the same
 * value — that conflation is what makes a detector report all-clear during an
 * outage.
 */
export type Listing =
  | { readonly listed: true; readonly messages: readonly MailboxMessage[] }
  | { readonly listed: false; readonly reason: string };

/**
 * The grace period is bounded, because Codex's review noted that an
 * excessively large caller-supplied value keeps every send permanently
 * `pending` — and a permanently pending detector reports `inconclusive`
 * forever, which is the one state that looks like nothing is wrong. A detector
 * whose own configuration can silence it is not a detector.
 */
export const MAX_GRACE_MS = 6 * 60 * 60 * 1000;

export type ReconciliationInput = {
  readonly audited: readonly AuditedSend[];
  readonly zohoSent: Listing;
  readonly officeCopies: Listing;
  readonly now: number;
  /** A send younger than this has not had time to appear and is not a divergence. */
  readonly graceMs: number;
  /** The probe send for this run, if one was made. */
  readonly canaryCorrelationId?: string;
};

export type Finding = {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly senderAddress: string;
  readonly ageMs: number;
};

export type ReconciliationReport = {
  /**
   * `ok` — at least one send matched on both sides and nothing diverged.
   * `diverged` — a send, or the canary, is missing where it should be.
   * `inconclusive` — there was not enough evidence to say either way.
   */
  readonly status: "ok" | "diverged" | "inconclusive";
  /** One line fit for an alert. Never says "ok" unless the status is ok. */
  readonly summary: string;
  readonly matched: number;
  /** Sent, and the office never got a copy. This is the HIGH 2 failure itself. */
  readonly missingFromOffice: readonly Finding[];
  /** Audited as sent, and not in Zoho's own Sent folder: a worse problem. */
  readonly missingFromZohoSent: readonly Finding[];
  /** Too recent to judge. Not a divergence, and not evidence either. */
  readonly pending: readonly Finding[];
  /** No usable correlation identifier, so nothing can be said about them. */
  readonly unmatchable: readonly Finding[];
  /** In the office record with no audited send behind it — another sender exists. */
  readonly unexplainedOfficeCopies: number;
  /** Why the status is inconclusive, empty otherwise. */
  readonly inconclusiveBecause: readonly string[];
};

/** `unidentified:<key>` is what the Zoho client records when the envelope was unreadable. */
export function isMatchable(correlationId: string): boolean {
  return correlationId.length > 0 && !correlationId.startsWith("unidentified:");
}

const finding = (send: AuditedSend, now: number): Finding => ({
  idempotencyKey: send.idempotencyKey,
  correlationId: send.correlationId,
  senderAddress: send.senderAddress,
  ageMs: now - send.at,
});

export function reconcile(input: ReconciliationInput): ReconciliationReport {
  const inconclusiveBecause: string[] = [];

  // Clamped rather than rejected, so a misconfiguration degrades to a shorter
  // grace — which over-reports divergence — instead of to silence.
  const graceMs = Math.min(Math.max(0, input.graceMs), MAX_GRACE_MS);
  if (input.graceMs > MAX_GRACE_MS) {
    inconclusiveBecause.push(
      `the configured grace of ${input.graceMs}ms exceeds the ${MAX_GRACE_MS}ms maximum and was clamped`,
    );
  }

  const zohoIds = input.zohoSent.listed
    ? new Set(input.zohoSent.messages.map((m) => m.correlationId))
    : undefined;
  const officeIds = input.officeCopies.listed
    ? new Set(input.officeCopies.messages.map((m) => m.correlationId))
    : undefined;

  if (!input.zohoSent.listed) inconclusiveBecause.push(`Zoho Sent could not be listed: ${input.zohoSent.reason}`);
  if (!input.officeCopies.listed) inconclusiveBecause.push(`The office copies could not be listed: ${input.officeCopies.reason}`);

  const matchedKeys: string[] = [];
  const missingFromOffice: Finding[] = [];
  const missingFromZohoSent: Finding[] = [];
  const pending: Finding[] = [];
  const unmatchable: Finding[] = [];

  for (const send of input.audited) {
    if (!isMatchable(send.correlationId)) {
      unmatchable.push(finding(send, input.now));
      continue;
    }
    const age = input.now - send.at;
    const isCanary = input.canaryCorrelationId !== undefined && send.correlationId === input.canaryCorrelationId;
    // The grace period is a delivery allowance, not a licence to ignore a
    // send indefinitely — and it does not cover the canary, which the run
    // itself made and therefore knows the age of.
    if (age < graceMs && !isCanary) {
      pending.push(finding(send, input.now));
      continue;
    }

    const inZoho = zohoIds?.has(send.correlationId);
    const inOffice = officeIds?.has(send.correlationId);

    // An unlistable side cannot produce a divergence — only an inconclusive
    // report, already recorded above.
    if (inZoho === false) {
      missingFromZohoSent.push(finding(send, input.now));
      continue;
    }
    if (inOffice === false) {
      missingFromOffice.push(finding(send, input.now));
      continue;
    }
    if (inZoho === true && inOffice === true) matchedKeys.push(send.idempotencyKey);
  }

  const auditedIds = new Set(input.audited.map((s) => s.correlationId).filter(isMatchable));
  const unexplainedOfficeCopies = input.officeCopies.listed
    ? input.officeCopies.messages.filter((m) => !auditedIds.has(m.correlationId)).length
    : 0;

  // The canary is checked on its own terms: its absence is the one finding
  // with no innocent explanation, so it is not softened by a grace period or
  // by the rest of the window looking healthy.
  const canaryFindings: string[] = [];
  if (input.canaryCorrelationId !== undefined) {
    const audited = input.audited.some((s) => s.correlationId === input.canaryCorrelationId);
    if (!audited) {
      canaryFindings.push("the canary send was never audited, so the relay did not record sending it");
    } else {
      if (zohoIds && !zohoIds.has(input.canaryCorrelationId)) canaryFindings.push("the canary is not in Zoho Sent");
      if (officeIds && !officeIds.has(input.canaryCorrelationId)) canaryFindings.push("the canary never reached the office record");
    }
  }

  if (input.audited.length === 0) {
    inconclusiveBecause.push("no audited send in the window, which a quiet period and a broken audit store both produce");
  } else if (matchedKeys.length === 0 && missingFromOffice.length === 0 && missingFromZohoSent.length === 0 && canaryFindings.length === 0) {
    inconclusiveBecause.push("no audited send could be matched on both sides");
  }

  const diverged = missingFromOffice.length > 0 || missingFromZohoSent.length > 0 || canaryFindings.length > 0;

  // Divergence outranks inconclusiveness: a found failure is a finding even
  // when the rest of the picture is incomplete.
  const status: ReconciliationReport["status"] = diverged
    ? "diverged"
    : inconclusiveBecause.length > 0
      ? "inconclusive"
      : "ok";

  return {
    status,
    summary: summarise(status, {
      matched: matchedKeys.length,
      missingFromOffice: missingFromOffice.length,
      missingFromZohoSent: missingFromZohoSent.length,
      pending: pending.length,
      unmatchable: unmatchable.length,
      canaryFindings,
      inconclusiveBecause,
    }),
    matched: matchedKeys.length,
    missingFromOffice,
    missingFromZohoSent,
    pending,
    unmatchable,
    unexplainedOfficeCopies,
    inconclusiveBecause,
  };
}

function summarise(
  status: ReconciliationReport["status"],
  counts: {
    matched: number;
    missingFromOffice: number;
    missingFromZohoSent: number;
    pending: number;
    unmatchable: number;
    canaryFindings: readonly string[];
    inconclusiveBecause: readonly string[];
  },
): string {
  if (status === "diverged") {
    const parts: string[] = [];
    if (counts.canaryFindings.length > 0) parts.push(...counts.canaryFindings);
    if (counts.missingFromOffice > 0) parts.push(`${counts.missingFromOffice} sent message(s) never reached the office record`);
    if (counts.missingFromZohoSent > 0) parts.push(`${counts.missingFromZohoSent} audited send(s) are not in Zoho Sent`);
    return `DIVERGED: ${parts.join("; ")}.`;
  }
  if (status === "inconclusive") {
    const extra = counts.unmatchable > 0 ? ` ${counts.unmatchable} send(s) had no usable correlation id.` : "";
    return `INCONCLUSIVE — ${counts.inconclusiveBecause.join("; ")}.${extra} This is not an all-clear.`;
  }
  const pending = counts.pending > 0 ? `, ${counts.pending} too recent to judge` : "";
  return `OK: ${counts.matched} send(s) matched in both Zoho Sent and the office record${pending}.`;
}
