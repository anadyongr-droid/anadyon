import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { NbgConfigurationError, NbgGatewayError } from "@/lib/nbg";
import { reconcileNbgPayment } from "@/lib/nbgReconciliation";

export const runtime = "nodejs";

const Attempt = z.string().uuid();

function destination(req: NextRequest, status: string) {
  const url = new URL("/payment/complete", req.url);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

export async function GET(req: NextRequest) {
  const limit = await checkRateLimit(req, {
    key: "nbg-return",
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) return limit.response!;

  const parsed = Attempt.safeParse(req.nextUrl.searchParams.get("attempt"));
  if (!parsed.success) return destination(req, "error");

  try {
    const result = await reconcileNbgPayment(
      parsed.data,
      req.nextUrl.searchParams.get("resultIndicator"),
    );
    if (result.status === "paid") return destination(req, "paid");
    if (result.status === "pending") return destination(req, "pending");
    return destination(req, "error");
  } catch (error) {
    if (error instanceof NbgConfigurationError || error instanceof NbgGatewayError) {
      console.error("[nbg] return reconciliation unavailable:", error.message);
    } else {
      console.error("[nbg] unexpected return error:", error);
    }
    return destination(req, "pending");
  }
}
