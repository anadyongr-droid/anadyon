import { bookingConfirmedMail, type BookingEmailDetails } from "@/lib/bookingEmails";
import { sendAuditedWorkflowMail } from "@/lib/auditedMail";
import { supabaseAdmin } from "@/lib/supabase";
import { reservationRef } from "@/lib/wise";

interface PaidReservationRow {
  id: string;
  customer_name: string;
  customer_first_name?: string | null;
  customer_email: string | null;
  pickup_date: string;
  pickup_time: string;
  pickup_location: string;
  return_date: string;
  return_time: string;
  dropoff_location?: string | null;
  total: number;
  deposit: number;
  balance_due: number;
  notes: string | null;
  status: string;
  deposit_paid_at: string | null;
  vehicles?: { name?: string | null } | { name?: string | null }[] | null;
  quotes?: { ref?: string | null } | { ref?: string | null }[] | null;
}

function one<T extends object>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function details(row: PaidReservationRow): BookingEmailDetails {
  const quote = one(row.quotes);
  const vehicle = one(row.vehicles);
  return {
    customerName: row.customer_name,
    customerFirstName: row.customer_first_name,
    customerEmail: row.customer_email ?? "",
    reference: reservationRef(row.id, row.notes, quote?.ref ?? undefined),
    vehicle: vehicle?.name ?? "Requested vehicle category",
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    pickupLocation: row.pickup_location,
    returnDate: row.return_date,
    returnTime: row.return_time,
    returnLocation: row.dropoff_location,
    total: Number(row.total),
    deposit: Number(row.deposit),
    balanceDue: Number(row.balance_due),
  };
}

const COLUMNS = "id, customer_name, customer_first_name, customer_email, pickup_date, pickup_time, pickup_location, return_date, return_time, dropoff_location, total, deposit, balance_due, notes, status, deposit_paid_at, vehicles(name), quotes(ref)";

export type ConfirmPaidBookingResult =
  | { outcome: "confirmed"; reference: string; expectedDeposit: number; total: number; emailQueued: boolean }
  | { outcome: "already_confirmed"; reference: string; expectedDeposit: number; total: number }
  | { outcome: "payment_mismatch"; reference: string; expectedDeposit: number; total: number }
  | { outcome: "invalid_state"; reference: string; status: string; expectedDeposit: number; total: number }
  | { outcome: "not_found" }
  | { outcome: "error"; error: string };

/**
 * Records a verified payment and sends the one formal booking confirmation.
 *
 * `deposit_paid_at IS NULL` is the payment-write idempotency gate shared by
 * Stripe's webhook, Stripe's return URL and a manually reconciled bank
 * transfer. The email has its own guard: one `booking_email_deliveries` row per
 * reservation per kind, enforced by a partial unique index, so payment can be
 * recorded before delivery and a retry can still send a mail that was neither
 * delivered nor queued without ever sending it twice.
 */
export async function confirmPaidBooking(input: {
  reservationId: string;
  paidAt: string;
  amountPaid?: number | null;
  currency?: string | null;
  manuallyVerified?: boolean;
}): Promise<ConfirmPaidBookingResult> {
  const { data: found, error: lookupError } = await supabaseAdmin
    .from("reservations")
    .select(COLUMNS)
    .eq("id", input.reservationId)
    .maybeSingle();

  if (lookupError) return { outcome: "error", error: lookupError.message };
  if (!found) return { outcome: "not_found" };

  const row = found as PaidReservationRow;
  const mailDetails = details(row);
  const expectedDeposit = Number(row.deposit);
  const total = Number(row.total);

  // An old payment link may still be opened after staff cancel or void a
  // booking. A valid Stripe payment must never silently resurrect it. Existing
  // paid bookings remain idempotent; every first-time confirmation must still
  // be at the pending/quote stage.
  const alreadyPaid = Boolean(row.deposit_paid_at);
  if (!alreadyPaid && row.status !== "pending") {
    return { outcome: "invalid_state", reference: mailDetails.reference, status: row.status, expectedDeposit, total };
  }

  const amount = input.amountPaid;
  const depositOk = typeof amount === "number" && Math.abs(amount - expectedDeposit) < 0.01;
  const fullPaymentOk = typeof amount === "number" && Math.abs(amount - total) < 0.01;
  const currencyOk = input.manuallyVerified || (input.currency ?? "").toLowerCase() === "eur";
  if (!currencyOk || (!depositOk && !fullPaymentOk)) {
    return { outcome: "payment_mismatch", reference: mailDetails.reference, expectedDeposit, total };
  }

  let newlyConfirmed = !alreadyPaid;
  let confirmedRow = row;
  if (newlyConfirmed) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("reservations")
      .update({
        status: "confirmed",
        deposit_paid_at: input.paidAt,
        balance_due: fullPaymentOk ? 0 : row.balance_due,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.reservationId)
      .is("deposit_paid_at", null)
      .select(COLUMNS)
      .maybeSingle();

    if (updateError) return { outcome: "error", error: updateError.message };
    if (updated) confirmedRow = updated as PaidReservationRow;
    else newlyConfirmed = false;
  }

  // A verified payment turns the promo hold taken at quote confirmation into a
  // redemption. Replay-safe in the database, so a repeated Stripe webhook does
  // not consume a second use of the code.
  if (newlyConfirmed) {
    const { error: redeemError } = await supabaseAdmin.rpc("promo_redeem", {
      p_reservation_id: input.reservationId,
      p_amount: null,
    });
    // Not fatal: the customer has paid and the booking is confirmed. A promo
    // that stays held is corrected by the expiry sweep, whereas refusing here
    // would leave a paid booking looking failed.
    if (redeemError) {
      console.error(`[confirm] promo redeem failed for ${input.reservationId}:`, redeemError.message);
    }
  }

  const confirmedDetails = details(confirmedRow);
  let emailQueued = false;
  if (confirmedDetails.customerEmail) {
    // The audit row's partial unique index is now the idempotency guard, so the
    // formal confirmation is sent exactly once per reservation and appears on
    // the reservation screen with its real delivery condition.
    const sent = await sendAuditedWorkflowMail({
      reservationId: input.reservationId,
      kind: "booking_confirmation",
      recipientEmail: confirmedDetails.customerEmail,
      mail: bookingConfirmedMail(confirmedDetails),
    });
    emailQueued = sent.queued;
    if (!sent.ok) {
      return { outcome: "error", error: "Payment was recorded but the booking confirmation email could not be sent or queued." };
    }
  }

  if (!newlyConfirmed) {
    return { outcome: "already_confirmed", reference: confirmedDetails.reference, expectedDeposit, total };
  }

  return {
    outcome: "confirmed",
    reference: confirmedDetails.reference,
    expectedDeposit,
    total,
    emailQueued,
  };
}
