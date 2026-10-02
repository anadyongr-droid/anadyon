import { NextResponse } from "next/server";
import { loadRateFreshness } from "@/lib/rateSourceFreshnessQuery";

// Admin-only via proxy.ts.
export const dynamic = "force-dynamic";

/**
 * How old each source's rate data is, on its own.
 *
 * The Market screen gets the same figures inside its comparison payload, which
 * it needs anyway. The Settings card needs only this, and asking the comparison
 * route for it would drag every observation and every rate across to render
 * four dates.
 */
export async function GET() {
  const now = new Date();
  const sources = await loadRateFreshness(now);
  return NextResponse.json(
    { sources, ranAt: now.toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
