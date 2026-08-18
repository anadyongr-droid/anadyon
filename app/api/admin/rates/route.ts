import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * The public booking form cannot show a price until this returns, so every
 * visitor was waiting on a function invocation and two database queries before
 * the price panel appeared at all — and on a cold start that was over a second.
 *
 * Rates change when someone edits them in the admin, which is rarely. Five
 * minutes of shared cache with an hour of stale-while-revalidate means almost
 * every visitor gets this from the CDN immediately, and an edit still reaches
 * the public site within five minutes without anyone clearing anything.
 */
export async function GET() {
  const [{ data: rates, error: ratesError }, { data: extras, error: extrasError }] = await Promise.all([
    supabaseAdmin.from("rates").select("*").order("pricing_group").order("season_name"),
    supabaseAdmin.from("extras_config").select("*").order("key"),
  ]);

  // A failure here used to return {rates: null} with a 200, which the form read
  // as "no rates" and silently hid the whole price panel — a booking form with
  // no prices and nothing explaining why. Say so instead, and do not cache it.
  if (ratesError || extrasError || !rates?.length) {
    console.error("[rates] lookup failed:", ratesError?.message ?? extrasError?.message ?? "no rates returned");
    return NextResponse.json(
      { error: "Rates are temporarily unavailable", rates: [], extras: extras ?? [] },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { rates, extras },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
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
