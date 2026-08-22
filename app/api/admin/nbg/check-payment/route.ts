import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getNbgConfig, NbgConfigurationError, NbgGatewayError } from "@/lib/nbg";
import { reconcileNbgPayment } from "@/lib/nbgReconciliation";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({ reservationId: z.string().uuid() }).strict();

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

  const { data: attempt, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("id")
    .eq("reservation_id", parsed.data.reservationId)
    .eq("provider", "nbg")
    .eq("environment", config.environment)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "NBG payment storage is not ready. Apply migration 031 before enabling NBG Pay." },
      { status: 503 },
    );
  }
  if (!attempt) return NextResponse.json({ error: "No NBG payment attempt exists." }, { status: 404 });

  try {
    const result = await reconcileNbgPayment(attempt.id);
    if (result.status === "paid") return NextResponse.json(result);
    if (result.status === "pending") return NextResponse.json(result, { status: 202 });
    return NextResponse.json({ error: "The NBG payment could not be reconciled." }, { status: 503 });
  } catch (err) {
    const unavailable = err instanceof NbgConfigurationError;
    const message = err instanceof NbgConfigurationError || err instanceof NbgGatewayError
      ? err.message
      : "The NBG payment could not be checked.";
    return NextResponse.json({ error: message }, { status: unavailable ? 503 : 502 });
  }
}
