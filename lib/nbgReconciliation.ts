import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { assessNbgOrder, getNbgConfig, retrieveNbgOrder } from "@/lib/nbg";
import { sendTelegram } from "@/lib/telegram";

interface PaymentAttempt {
  id: string;
  reservation_id: string;
  environment: "test" | "production";
  external_order_id: string;
  amount: number | string;
  currency: "EUR";
  status: string;
  success_indicator: string | null;
}

export type NbgReconciliationResult =
  | { status: "paid"; reservationId: string; amount: number; applied: boolean }
  | { status: "pending"; reservationId: string; reason: string }
  | { status: "not_found" | "unavailable"; reason: string };

export async function reconcileNbgPayment(
  attemptId: string,
  resultIndicator?: string | null,
): Promise<NbgReconciliationResult> {
  const config = getNbgConfig();
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("id, reservation_id, environment, external_order_id, amount, currency, status, success_indicator")
    .eq("id", attemptId)
    .eq("provider", "nbg")
    .maybeSingle();

  if (error) {
    console.error("[nbg] payment attempt lookup failed:", error.message);
    return { status: "unavailable", reason: "lookup_failed" };
  }
  if (!data) return { status: "not_found", reason: "attempt_not_found" };

  const attempt = data as PaymentAttempt;
  if (attempt.environment !== config.environment) {
    return { status: "pending", reservationId: attempt.reservation_id, reason: "environment_mismatch" };
  }
  if (attempt.status === "paid") {
    return {
      status: "paid",
      reservationId: attempt.reservation_id,
      amount: Number(attempt.amount),
      applied: false,
    };
  }
  if (attempt.success_indicator && resultIndicator && attempt.success_indicator !== resultIndicator) {
    return { status: "pending", reservationId: attempt.reservation_id, reason: "result_indicator" };
  }

  const order = await retrieveNbgOrder(config, attempt.external_order_id);
  const assessment = assessNbgOrder(order, {
    orderId: attempt.external_order_id,
    amount: Number(attempt.amount),
    currency: "EUR",
  });

  if (!assessment.paid) {
    await supabaseAdmin
      .from("payment_attempts")
      .update({ gateway_result: assessment.reason })
      .eq("id", attempt.id);
    return { status: "pending", reservationId: attempt.reservation_id, reason: assessment.reason };
  }

  const paidAt = new Date().toISOString();
  const { data: completion, error: completionError } = await supabaseAdmin.rpc(
    "complete_nbg_deposit_payment",
    {
      p_attempt_id: attempt.id,
      p_gateway_result: assessment.gatewayResult,
      p_paid_at: paidAt,
    },
  );

  const row = Array.isArray(completion) ? completion[0] : completion;
  if (completionError || !row) {
    console.error("[nbg] could not atomically record verified payment:", completionError?.message ?? "no result");
    return { status: "unavailable", reason: "record_failed" };
  }

  const amount = Number(row.amount);
  if (row.applied) {
    await sendTelegram(
      `✅ <b>NBG Deposit Received</b>\nReservation: ${row.reservation_id}\n€${amount.toFixed(2)}`,
    );
  }

  return {
    status: "paid",
    reservationId: row.reservation_id,
    amount,
    applied: Boolean(row.applied),
  };
}
