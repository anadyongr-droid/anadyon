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

async function getIp(req: NextRequest): Promise<string> {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
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
    .select("*")
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
