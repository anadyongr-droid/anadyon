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

/**
 * Columns are listed rather than selected with `*`, because this endpoint is
 * reachable without authentication — the public booking form needs the price
 * card to render — while the query itself runs as the service role and so
 * bypasses RLS entirely. Under `*`, any column added to `rates` or
 * `extras_config` in future would start being served to the open internet the
 * moment the migration ran, with nothing in this file changing to say so. A
 * cost basis, a supplier rate or a margin column is exactly the kind of thing
 * that gets added to a rates table.
 *
 * Everything named here is already public: these are the prices the site shows
 * to every visitor. Adding a column to that list should be a deliberate act.
 */
const RATE_COLUMNS = "id, pricing_group, season_name, season_months, rate_1_2, rate_3_6, rate_7plus, updated_at";
const EXTRAS_COLUMNS = "id, key, label, daily_rate, enabled, updated_at";

/** One retry after a short pause clears a clock-skew rejection outright. */
async function fetchRates() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [r, e] = await Promise.all([
      supabaseAdmin.from("rates").select(RATE_COLUMNS).order("pricing_group").order("season_name"),
      supabaseAdmin.from("extras_config").select(EXTRAS_COLUMNS).order("key"),
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
