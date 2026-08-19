import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Progressive block durations after N cumulative failures from the same IP
function blockSeconds(failCount: number): number {
  if (failCount >= 12) return 86400;  // 24 hours
  if (failCount >= 8)  return 3600;   // 1 hour
  if (failCount >= 5)  return 600;    // 10 minutes
  if (failCount >= 3)  return 30;     // 30 seconds
  return 0;
}

function humanDuration(seconds: number): string {
  if (seconds >= 86400) return "24 hours";
  if (seconds >= 3600)  return `${Math.ceil(seconds / 3600)} hour${Math.ceil(seconds / 3600) > 1 ? "s" : ""}`;
  if (seconds >= 60)    return `${Math.ceil(seconds / 60)} minutes`;
  return `${seconds} seconds`;
}

/**
 * The client address, preferring the header the platform sets itself.
 *
 * `x-forwarded-for` is caller-supplied. On Vercel the edge overwrites it with
 * the address it actually terminated — verified against production, where a
 * dozen requests carrying forged X-Forwarded-For values recorded the real IP
 * every time and never the forged one — so reading it first is not currently
 * exploitable here.
 *
 * It is still the wrong header to read first. This endpoint is the only public
 * surface that returns a customer's own booking, and its brute-force guard is
 * the only thing standing between a guessed reference and that data. Trusting
 * a client-supplied header makes that guard contingent on edge behaviour we do
 * not control and no test covers: behind a different proxy, or after a change
 * at the platform, the guard would become bypassable with one header and
 * nothing would fail visibly. `lib/rateLimit.ts` already prefers the platform
 * header for exactly this reason; this file is brought in line with it.
 */
async function getIp(req: NextRequest): Promise<string> {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();

  return "unknown";
}

async function checkRateLimit(ip: string): Promise<{ blocked: boolean; retryAfter?: string }> {
  const { data } = await supabaseAdmin
    .from("quote_rate_limits")
    .select("fail_count, blocked_until")
    .eq("ip", ip)
    .maybeSingle();

  if (data?.blocked_until && new Date(data.blocked_until) > new Date()) {
    const remaining = Math.ceil((new Date(data.blocked_until).getTime() - Date.now()) / 1000);
    return { blocked: true, retryAfter: humanDuration(remaining) };
  }
  return { blocked: false };
}

async function recordFailure(ip: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("quote_rate_limits")
    .select("fail_count")
    .eq("ip", ip)
    .maybeSingle();

  const newCount = (data?.fail_count ?? 0) + 1;
  const secs = blockSeconds(newCount);
  const blockedUntil = secs > 0 ? new Date(Date.now() + secs * 1000).toISOString() : null;

  await supabaseAdmin.from("quote_rate_limits").upsert(
    { ip, fail_count: newCount, blocked_until: blockedUntil, updated_at: new Date().toISOString() },
    { onConflict: "ip" }
  );
}

async function resetFailures(ip: string): Promise<void> {
  await supabaseAdmin.from("quote_rate_limits").upsert(
    { ip, fail_count: 0, blocked_until: null, updated_at: new Date().toISOString() },
    { onConflict: "ip" }
  );
}

/**
 * Exactly the fields the quote page renders — the `Quote` type in
 * app/quote/[ref]/page.tsx, plus the two this route needs itself (`last_name`
 * to check the surname, `expires_at` to check expiry).
 *
 * `select("*")` returned all 42 columns of the row. Thirteen of them were sent
 * to the browser and never shown: date of birth, street address, city, postal
 * code, country, both phone numbers, flight number, and the internal ids.
 *
 * That data belongs to the person looking it up, so this was not a leak to a
 * stranger. It did change what a successful lookup is worth. The gate here is
 * a reference plus a surname — weaker than a login, and surnames are not
 * secret — and behind it sat a date of birth and a home address rather than
 * just dates and a car model. Those two facts together are the useful half of
 * an identity theft; the booking summary is not.
 *
 * Listing the columns also means a future migration cannot publish a new one
 * by accident. Anything added here should be something the page displays.
 */
// One unbroken literal on purpose: supabase-js derives the row type from the
// literal text of the select, so concatenating or joining the parts widens it
// to `string` and the result comes back untyped.
const QUOTE_COLUMNS = "ref, title, first_name, last_name, email, vehicle_type, selected_model, transmission, pickup_location, dropoff_location, pickup_date, pickup_time, dropoff_date, dropoff_time, rental_days, daily_rate, vehicle_subtotal, extras_subtotal, total, deposit, balance_due, driver_age, baby_seat, child_seat, fdw, additional_drivers, comments, created_at, expires_at";

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const surname = req.nextUrl.searchParams.get("surname")?.trim() ?? "";

  if (!surname) {
    return NextResponse.json({ error: "Surname required" }, { status: 400 });
  }

  const ip = await getIp(req);

  // Check if this IP is currently blocked
  const { blocked, retryAfter } = await checkRateLimit(ip);
  if (blocked) {
    return NextResponse.json(
      { error: `Too many failed attempts. Please try again in ${retryAfter}.` },
      { status: 429 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select(QUOTE_COLUMNS)
    .eq("ref", ref.toUpperCase())
    .single();

  if (error || !data) {
    await recordFailure(ip);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (data.last_name.toLowerCase() !== surname.toLowerCase()) {
    await recordFailure(ip);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This quote is no longer available online. Please contact us directly." },
      { status: 410 }
    );
  }

  // Successful lookup — reset failure count for this IP
  await resetFailures(ip);

  return NextResponse.json(data);
}
