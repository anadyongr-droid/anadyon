import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const ValidateSchema = z.object({
  code: z.string().min(1).max(50),
  total: z.number().nonnegative(),
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

  const { code, total } = parsed.data;

  // Use the atomic DB function to validate (read-only path here — no increment)
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

  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: "This promo code has reached its usage limit" });
  }

  const discount_amount = data.type === "percentage"
    ? parseFloat(((total * data.value) / 100).toFixed(2))
    : parseFloat(Number(data.value).toFixed(2));

  return NextResponse.json({
    valid: true,
    code: data.code,
    id: data.id,
    discount_amount,
    discount_type: data.type,
    value: data.value,
    description: data.description,
  });
}
