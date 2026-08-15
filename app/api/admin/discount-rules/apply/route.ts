import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST { pickup_date, rental_days, pricing_group, driver_age, total }
// Returns applicable discount rules and the recommended discount_amount
export async function POST(req: NextRequest) {
  const { pickup_date, rental_days, pricing_group, driver_age, total } = await req.json();

  const { data: rules } = await supabaseAdmin
    .from("discount_rules")
    .select("*")
    .eq("active", true);

  if (!rules?.length) return NextResponse.json({ discount_amount: 0, applied: [] });

  const today = new Date().toISOString().slice(0, 10);
  const daysUntilPickup = pickup_date
    ? Math.floor((new Date(pickup_date).getTime() - new Date(today).getTime()) / 86400000)
    : 0;

  let totalDiscount = 0;
  const applied: { name: string; amount: number }[] = [];

  for (const rule of rules) {
    // Skip if rule is for a specific pricing group that doesn't match
    if (rule.pricing_group && rule.pricing_group !== pricing_group) continue;

    let applies = false;
    if (rule.type === "early_bird" && daysUntilPickup >= rule.threshold) applies = true;
    if (rule.type === "min_stay" && rental_days >= rule.threshold) applies = true;
    if (rule.type === "full_payment" && daysUntilPickup >= rule.threshold) applies = true;
    if (rule.type === "age_surcharge") {
      // age_surcharge applies when driver age is under the threshold
      const ageNum = parseInt(String(driver_age).split("–")[0]);
      if (!isNaN(ageNum) && ageNum <= rule.threshold) applies = true;
    }

    if (!applies) continue;

    let amount = 0;
    if (rule.discount_type === "percentage") amount = parseFloat(((total * rule.value) / 100).toFixed(2));
    if (rule.discount_type === "fixed") amount = rule.value;
    if (rule.discount_type === "surcharge") amount = -rule.value; // negative = adds to total

    totalDiscount += amount;
    applied.push({ name: rule.name, amount });
  }

  return NextResponse.json({
    discount_amount: parseFloat(totalDiscount.toFixed(2)),
    applied,
  });
}
