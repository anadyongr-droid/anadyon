import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST /api/promo/validate  { code, total }
// Returns { valid, discount_amount, discount_type, value, description }
export async function POST(req: NextRequest) {
  const { code, total } = await req.json();
  if (!code) return NextResponse.json({ valid: false, error: "No code provided" });

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("active", true)
    .ilike("code", code.trim())
    .single();

  if (error || !data) {
    return NextResponse.json({ valid: false, error: "Invalid or expired promo code" });
  }

  // Check expiry
  if (data.expires_at && data.expires_at < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ valid: false, error: "This promo code has expired" });
  }

  // Check max uses
  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: "This promo code has reached its usage limit" });
  }

  const discount_amount = data.type === "percentage"
    ? parseFloat(((Number(total) * data.value) / 100).toFixed(2))
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
