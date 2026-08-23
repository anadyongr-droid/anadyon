/**
 * How far a customer has been taken through the booking conversation, derived
 * from what was actually sent rather than stored as its own editable field.
 *
 * `reservations.status` already means something else — the operational state of
 * the rental — and overloading it would make "Confirmed" ambiguous between "we
 * emailed them" and "they paid". The stage is instead read from the durable
 * `booking_email_deliveries` rows, so it cannot claim an email the audit trail
 * does not support, and there is nothing for a client to supply.
 */

export type EmailKind = "acknowledgment" | "quote_confirmation" | "booking_confirmation";

export type DeliveryStatus =
  | "pending" | "queued" | "accepted" | "sent" | "delivered"
  | "delayed" | "bounced" | "complained" | "failed" | "suppressed";

/** Ascending. The furthest reached kind is the stage. */
export const EMAIL_KIND_ORDER: readonly EmailKind[] = [
  "acknowledgment",
  "quote_confirmation",
  "booking_confirmation",
];

export const WORKFLOW_STAGE_LABEL: Record<EmailKind, string> = {
  acknowledgment: "Acknowledged",
  quote_confirmation: "Quote Confirmation",
  booking_confirmation: "Booking confirmed",
};

/**
 * Statuses that mean the provider has taken the message.
 *
 * `pending` and `queued` are excluded deliberately: the row exists before the
 * provider is called, and a queued message is one that failed and is waiting
 * for the retry cron. Counting either would tell the office a customer had been
 * emailed when nothing had left the building.
 *
 * `failed` is excluded for the same reason. It is written both by the mailer
 * when a message could be neither sent nor queued, and by an `email.failed`
 * webhook after the provider gave up; neither is a delivery, and overstating is
 * worse than understating here.
 */
const DISPATCHED: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>([
  "accepted", "sent", "delivered", "delayed", "bounced", "complained", "suppressed",
]);

/** How each delivery condition is described beside the stage. */
export const DELIVERY_CONDITION_LABEL: Record<DeliveryStatus, string> = {
  pending: "Not yet sent",
  queued: "Queued for retry",
  accepted: "Accepted by email provider",
  sent: "Sent by email provider",
  delivered: "Delivered to recipient's mail server",
  delayed: "Delivery delayed",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
  suppressed: "Suppressed",
};

export interface DeliveryRow {
  kind: EmailKind | string;
  status: DeliveryStatus | string;
  created_at?: string | null;
}

/**
 * Delivery conditions that mean somebody has to do something.
 *
 * `delayed` is included deliberately: a delayed quote confirmation is a
 * customer sitting without the price they are waiting for, and it is worth
 * seeing early even though some delays clear themselves. `accepted` and `sent`
 * are not problems — the provider has the message — and `delivered` least of
 * all, which is why "anything that is not delivered" would have been the wrong
 * rule: it would flag every message during the seconds before confirmation.
 */
const NEEDS_ATTENTION: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>([
  "bounced", "complained", "failed", "suppressed", "delayed",
]);

export function deliveryNeedsAttention(status: string | null | undefined): boolean {
  return NEEDS_ATTENTION.has(status as DeliveryStatus);
}

export interface WorkflowStage {
  /** Null until at least one workflow email has actually been dispatched. */
  stage: EmailKind | null;
  stageLabel: string | null;
  /** Condition of the message that set the stage — shown beside it, not instead. */
  condition: DeliveryStatus | null;
  conditionLabel: string | null;
  /** "Booking confirmed — Bounced", or just the stage when it was delivered. */
  display: string | null;
}

function rank(kind: string): number {
  return EMAIL_KIND_ORDER.indexOf(kind as EmailKind);
}

/**
 * The furthest stage the delivery records actually support.
 *
 * When a kind has been sent more than once — staff may resend a quote
 * confirmation — the most recent dispatched attempt supplies the condition, so
 * a later successful resend replaces an earlier bounce rather than being hidden
 * behind it.
 */
export function deriveWorkflowStage(deliveries: readonly DeliveryRow[] | null | undefined): WorkflowStage {
  const none: WorkflowStage = {
    stage: null, stageLabel: null, condition: null, conditionLabel: null, display: null,
  };
  if (!deliveries?.length) return none;

  const dispatched = deliveries.filter(
    (row) => rank(row.kind) >= 0 && DISPATCHED.has(row.status as DeliveryStatus),
  );
  if (!dispatched.length) return none;

  const furthest = dispatched.reduce((best, row) => (rank(row.kind) > rank(best.kind) ? row : best));
  const stage = furthest.kind as EmailKind;

  const latestOfStage = dispatched
    .filter((row) => row.kind === stage)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];

  const condition = latestOfStage.status as DeliveryStatus;
  const stageLabel = WORKFLOW_STAGE_LABEL[stage];
  const conditionLabel = DELIVERY_CONDITION_LABEL[condition] ?? condition;

  return {
    stage,
    stageLabel,
    condition,
    conditionLabel,
    // A delivered message needs no qualifier; anything else does, so the office
    // is never told a customer was reached when the mail actually bounced.
    display: condition === "delivered" ? stageLabel : `${stageLabel} — ${conditionLabel}`,
  };
}
