import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const [{ data: rates }, { data: extras }] = await Promise.all([
    supabaseAdmin.from("rates").select("*").order("pricing_group").order("season_name"),
    supabaseAdmin.from("extras_config").select("*").order("key"),
  ]);
  return NextResponse.json({ rates, extras });
}

export async function PATCH(req: NextRequest) {
  const { rates, extras } = await req.json();

  const errors: string[] = [];

  if (rates) {
    for (const r of rates) {
      const { error } = await supabaseAdmin
        .from("rates")
        .update({ rate_1_2: r.rate_1_2, rate_3_6: r.rate_3_6, rate_7plus: r.rate_7plus, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) errors.push(error.message);
    }
  }

  if (extras) {
    for (const e of extras) {
      const { error } = await supabaseAdmin
        .from("extras_config")
        .update({ daily_rate: e.daily_rate, enabled: e.enabled, updated_at: new Date().toISOString() })
        .eq("id", e.id);
      if (error) errors.push(error.message);
    }
  }

  if (errors.length) return NextResponse.json({ errors }, { status: 500 });
  return NextResponse.json({ ok: true });
}
