import { mailIsRedirected, mailRedirectTarget, sendMail, type Mail, type SendResult } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";
import type { EmailKind } from "@/lib/emailWorkflowStage";

/**
 * Sends one of the three customer workflow emails through the audit trail.
 *
 * The audit row is written *before* the provider is called, so a send that
 * times out still leaves a durable record rather than vanishing. The row's UUID
 * travels as a Resend tag, which is how a webhook correlates the delivery back
 * even when the provider message ID has not been written yet.
 *
 * For `acknowledgment` and `booking_confirmation` the insert itself is the
 * idempotency guard: a partial unique index allows only one row per reservation
 * per kind, so a replayed payment webhook or a resubmitted request cannot send
 * a second copy. `quote_confirmation` is deliberately exempt — staff resend it
 * on purpose, and its history is what the reservation screen shows.
 */
export interface AuditedMailResult {
  /** False only when the message was neither sent nor safely queued. */
  ok: boolean;
  queued: boolean;
  deliveryId?: string;
  /** True when this kind had already been sent and nothing was sent again. */
  duplicate?: boolean;
  reason?: string;
}

const ONCE_PER_RESERVATION: ReadonlySet<EmailKind> = new Set<EmailKind>([
  "acknowledgment",
  "booking_confirmation",
]);

export async function sendAuditedWorkflowMail(input: {
  reservationId: string;
  kind: EmailKind;
  recipientEmail: string;
  mail: Mail;
  paymentDeadline?: Date | null;
  /** Resend keeps this for 24h; defaults to the delivery id. */
  idempotencyKey?: string;
}): Promise<AuditedMailResult> {
  const { reservationId, kind, recipientEmail, mail } = input;

  const { data: delivery, error } = await supabaseAdmin
    .from("booking_email_deliveries")
    .insert({
      reservation_id: reservationId,
      kind,
      intended_recipient_email: recipientEmail,
      delivery_recipient_email: mailRedirectTarget ?? recipientEmail,
      subject: mail.subject,
      payment_deadline: input.paymentDeadline?.toISOString() ?? null,
      redirected: mailIsRedirected,
    })
    .select("id")
    .single();

  if (error || !delivery) {
    // 23505 on a once-per-reservation kind means this email has already been
    // sent. That is a success for the caller — the customer has it — and must
    // not be retried into a duplicate.
    if (error?.code === "23505" && ONCE_PER_RESERVATION.has(kind)) {
      return { ok: true, queued: false, duplicate: true };
    }
    console.error(`[mail] could not audit ${kind} for ${reservationId}:`, error?.message);
    return { ok: false, queued: false, reason: error?.message ?? "audit row could not be created" };
  }

  mail.tags = [
    { name: "category", value: kind },
    { name: "delivery_id", value: delivery.id },
  ];

  const sent: SendResult = await sendMail(mail, {
    deliveryId: delivery.id,
    idempotencyKey: input.idempotencyKey ?? `${kind}-${delivery.id}`,
  });

  // Neither delivered nor queued: the message is genuinely lost, so the row is
  // marked failed. That drops it out of the partial unique index and lets a
  // later retry send this kind again, while keeping the failed attempt visible
  // as the record that a confirmation once went missing. Marked here rather
  // than relying on the mailer having done it, because the retry contract is
  // this layer's to keep.
  if (!sent.ok && !sent.queued) {
    const { error: markError } = await supabaseAdmin
      .from("booking_email_deliveries")
      .update({
        status: "failed",
        last_error: sent.reason ?? "send failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    if (markError) {
      console.error(`[mail] could not mark ${kind} delivery failed:`, markError.message);
    }
  }

  return {
    ok: sent.ok || sent.queued,
    queued: sent.queued,
    deliveryId: delivery.id,
    duplicate: false,
    reason: sent.reason,
  };
}
