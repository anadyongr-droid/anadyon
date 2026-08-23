import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

/**
 * Answers one question: is this code usable, and what is its formula?
 *
 * It deliberately does not answer "how much is it worth". The caller used to
 * send the total the discount should be calculated against, which let the
 * client choose the base of a percentage — and the resulting figure was then
 * kept by the form and submitted back as `discountAmount`. The amount is now
 * derived from the formula against whatever the subtotal currently is: in the
 * browser for display, and in the database for the figure that is actually
 * stored. Neither uses a number the client chose.
 */
const ValidateSchema = z.object({
  code: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = ValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Invalid input" }, { status: 400 });
  }

  const { code } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, type, value, expires_at, max_uses, used_count, description, active")
    .eq("active", true)
    .ilike("code", code.trim())
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ valid: false, error: "Invalid or expired promo code" });
  }

  if (data.expires_at && data.expires_at < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ valid: false, error: "This promo code has expired" });
  }

  // A preview only. Availability is re-checked and the hold taken atomically
  // when the booking is written, so a code that runs out between this check and
  // submission is settled by the database, not by this answer.
  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: "This promo code has reached its usage limit" });
  }

  return NextResponse.json({
    valid: true,
    code: data.code,
    id: data.id,
    discount_type: data.type,
    value: Number(data.value),
    description: data.description,
  });
}
