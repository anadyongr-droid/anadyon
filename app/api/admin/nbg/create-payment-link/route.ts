import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import {
  getNbgConfig,
  initiateNbgPaymentLink,
  isAllowedNbgCheckoutUrl,
  NbgConfigurationError,
  NbgGatewayError,
} from "@/lib/nbg";

export const runtime = "nodejs";

const Body = z.object({ reservationId: z.string().uuid() }).strict();
const PAYABLE_STATUSES = new Set(["pending", "confirmed"]);

function orderId(): string {
  return `AN-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toUpperCase();
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid reservation ID is required." }, { status: 400 });
  }

  let config: ReturnType<typeof getNbgConfig>;
  try {
    config = getNbgConfig();
  } catch (error) {
    const message = error instanceof NbgConfigurationError
      ? error.message
      : "NBG Pay is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, customer_email, deposit, deposit_paid_at, status")
    .eq("id", parsed.data.reservationId)
    .maybeSingle();

  if (reservationError) {
    console.error("[nbg] reservation lookup failed:", reservationError.message);
    return NextResponse.json({ error: "The reservation could not be checked." }, { status: 503 });
  }
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (reservation.deposit_paid_at) {
    return NextResponse.json({ error: "This reservation deposit is already recorded as paid." }, { status: 409 });
  }
  if (!PAYABLE_STATUSES.has(reservation.status)) {
    return NextResponse.json(
      { error: `A deposit link cannot be created for a ${reservation.status} reservation.` },
      { status: 409 },
    );
  }

  const amount = Number(reservation.deposit);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "This reservation has no valid deposit to charge." }, { status: 400 });
  }

  const { data: active, error: activeError } = await supabaseAdmin
    .from("payment_attempts")
    .select("id, checkout_url, expires_at, status, created_at")
    .eq("reservation_id", reservation.id)
    .eq("provider", "nbg")
    .eq("environment", config.environment)
    .in("status", ["initiated", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    console.error("[nbg] active-attempt lookup failed:", activeError.message);
    return NextResponse.json(
      { error: "NBG payment storage is not ready. Apply migration 031 before enabling NBG Pay." },
      { status: 503 },
    );
  }

  if (active?.checkout_url
      && (!active.expires_at || new Date(active.expires_at).getTime() > Date.now())
      && isAllowedNbgCheckoutUrl(active.checkout_url, config.environment)) {
    return NextResponse.json({
      checkoutUrl: active.checkout_url,
      attemptId: active.id,
      reused: true,
    });
  }

  // An initiated row without a stored URL is deliberately never expired by
  // time alone. The request may have reached NBG before this process crashed;
  // issuing another link could then let the customer pay twice. An admin must
  // reconcile or explicitly close that attempt before a replacement is made.
  if (active) {
    return NextResponse.json(
      {
        error:
          "An NBG payment order already exists but its link was not stored. " +
          "Use Check NBG payment or ask an administrator to review it; do not issue another link.",
      },
      { status: 409 },
    );
  }

  const externalOrderId = orderId();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const { data: attempt, error: insertError } = await supabaseAdmin
    .from("payment_attempts")
    .insert({
      reservation_id: reservation.id,
      provider: "nbg",
      environment: config.environment,
      purpose: "deposit",
      external_order_id: externalOrderId,
      amount: amount.toFixed(2),
      currency: "EUR",
      status: "initiated",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !attempt) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        { error: "An NBG payment link already exists for this deposit." },
        { status: 409 },
      );
    }
    console.error("[nbg] payment attempt insert failed:", insertError?.message ?? "no row");
    return NextResponse.json(
      { error: "NBG payment storage is not ready. Apply migration 031 before enabling NBG Pay." },
      { status: 503 },
    );
  }

  try {
    const returnUrl = `${config.siteUrl}/api/nbg/return?attempt=${encodeURIComponent(attempt.id)}`;
    const errorUrl = `${config.siteUrl}/payment/complete?status=error`;
    const link = await initiateNbgPaymentLink(config, {
      orderId: externalOrderId,
      amount,
      reservationId: reservation.id,
      returnUrl,
      errorUrl,
      expiresAt,
    });

    let updateError: { message: string } | null = null;
    for (let retry = 0; retry < 3; retry++) {
      const result = await supabaseAdmin
        .from("payment_attempts")
        .update({
          status: "pending",
          checkout_url: link.url,
          external_session_id: link.paymentLinkId ?? link.sessionId,
          success_indicator: link.successIndicator,
          expires_at: link.expiresAt ?? expiresAt,
          gateway_result: link.result,
        })
        .eq("id", attempt.id);
      updateError = result.error;
      if (!updateError) break;
      if (retry < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (retry + 1)));
    }

    if (updateError) {
      console.error("[nbg] could not store issued payment link:", updateError.message);
      // The immutable order ID, reservation and amount were stored before the
      // bank call, so this link is still reconcilable. Return it once, with a
      // prominent warning; the active-row constraint blocks any replacement.
      return NextResponse.json({
        checkoutUrl: link.url,
        attemptId: attempt.id,
        reused: false,
        warning: "NBG created the link but Anadyon could not save the URL. Copy it now and do not create another.",
      });
    }

    return NextResponse.json({ checkoutUrl: link.url, attemptId: attempt.id, reused: false });
  } catch (error) {
    const message = error instanceof NbgGatewayError ? error.message : "NBG Pay rejected the request.";
    console.error("[nbg] payment link creation failed:", message);
    await supabaseAdmin
      .from("payment_attempts")
      .update({ status: "failed", gateway_result: "initiate_failed" })
      .eq("id", attempt.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
