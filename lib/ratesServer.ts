import { supabaseAdmin } from "@/lib/supabase";
import type { Rate, ExtrasConfig } from "@/lib/pricing";

/**
 * Reads the rate card at render time, so the booking form opens with prices
 * already in hand.
 *
 * The form used to mount with `rates: []` and fetch on the client, which meant
 * the request only began when the customer clicked "Get Quote". Because the
 * form pre-fills today and tomorrow, `rentalDays` is 1 the instant it opens, so
 * the price skeleton was on screen immediately and stayed for the length of the
 * round trip — measured on production at 110ms against a warm CDN and 560-660ms
 * against a cold one. Every customer saw it, on the click that matters most.
 *
 * The columns are pinned rather than selected with `*`, for the same reason as
 * the API route: this data reaches the public, and a column added to `rates`
 * later should not publish itself by default.
 */
const RATE_COLUMNS =
  "id, pricing_group, season_name, season_months, rate_1_2, rate_3_6, rate_7plus, updated_at";
const EXTRAS_COLUMNS = "id, key, label, daily_rate, enabled, updated_at";

export interface InitialRates {
  rates: Rate[];
  extras: ExtrasConfig[];
}

/**
 * Returns null rather than throwing when the card cannot be read.
 *
 * Null is a supported outcome, not a failure: the form falls back to fetching
 * on the client exactly as before, so a page still renders and still sells. CI
 * relies on this — it builds with placeholder Supabase credentials and never
 * reaches a real database, and a page that threw here would break the build
 * for a purely optional optimisation.
 */
export async function loadRateCard(): Promise<InitialRates | null> {
  try {
    const [r, e] = await Promise.all([
      supabaseAdmin.from("rates").select(RATE_COLUMNS).order("pricing_group").order("season_name"),
      supabaseAdmin.from("extras_config").select(EXTRAS_COLUMNS).order("key"),
    ]);
    if (r.error || e.error || !r.data?.length) return null;
    return { rates: r.data as unknown as Rate[], extras: (e.data ?? []) as unknown as ExtrasConfig[] };
  } catch {
    return null;
  }
}
