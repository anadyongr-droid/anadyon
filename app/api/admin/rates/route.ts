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
/**
 * The last rate card that came back intact, kept per instance.
 *
 * Supabase occasionally rejects a request with "JWT issued at future": the keys
 * are the newer sb_secret_ format, so the JWT is minted inside Supabase when it
 * exchanges the key, and a second of clock drift between their minting and
 * validating services is enough. It is transient — the next request succeeds —
 * but the customer whose page load caught it saw a booking form with no prices.
 *
 * Nothing here can fix a clock inside Supabase. Serving the last known-good
 * card for a few minutes is better than showing no price at all, and rates
 * change rarely enough that a slightly stale card is honest.
 */
let lastGood: { rates: unknown[]; extras: unknown[]; at: number } | null = null;
const STALE_LIMIT_MS = 15 * 60 * 1000;

/** One retry after a short pause clears a clock-skew rejection outright. */
async function fetchRates() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [r, e] = await Promise.all([
      supabaseAdmin.from("rates").select("*").order("pricing_group").order("season_name"),
      supabaseAdmin.from("extras_config").select("*").order("key"),
    ]);
    if (!r.error && !e.error && r.data?.length) return { rates: r.data, extras: e.data ?? [], error: null };

    const why = r.error?.message ?? e.error?.message ?? "no rates returned";
    if (attempt < 2) {
      console.warn(`[rates] attempt ${attempt + 1} failed (${why}); retrying`);
      await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
    } else {
      return { rates: null, extras: e.data ?? [], error: why };
    }
  }
  return { rates: null, extras: [], error: "unreachable" };
}

export async function GET() {
  const { rates, extras, error } = await fetchRates();

  if (rates) {
    lastGood = { rates, extras, at: Date.now() };
    return NextResponse.json(
      { rates, extras },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  }

  // Three attempts have failed. If a recent card is in hand, the customer gets a
  // price rather than an apology — the alternative is a booking form with no
  // prices, which is worse than one showing figures a few minutes old.
  if (lastGood && Date.now() - lastGood.at < STALE_LIMIT_MS) {
    console.warn(`[rates] serving a card ${Math.round((Date.now() - lastGood.at) / 1000)}s old after: ${error}`);
    return NextResponse.json(
      { rates: lastGood.rates, extras: lastGood.extras, stale: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Nothing to fall back on. Say so plainly; do not cache a failure.
  console.error(`[rates] lookup failed after 3 attempts and no recent card: ${error}`);
  return NextResponse.json(
    { error: "Rates are temporarily unavailable", rates: [], extras: extras ?? [] },
    { status: 503, headers: { "Cache-Control": "no-store" } }
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
