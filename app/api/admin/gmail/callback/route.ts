import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, saveTokens } from "@/lib/gmail";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/gmail/callback?code=&state=... — completes OAuth flow
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) {
    return NextResponse.redirect(new URL("/admin/settings?gmail=error", req.url));
  }

  // Verify the CSRF state: right value, and recent.
  const { data: stored } = await supabaseAdmin
    .from("system_settings")
    .select("value, updated_at")
    .eq("key", "gmail_oauth_state")
    .maybeSingle();

  // Consumed first, and unconditionally.
  //
  // It used to be deleted only after a successful comparison, which left a
  // failed attempt's state sitting in the table indefinitely — available to
  // try against again. Removing it before the checks means one attempt is all
  // anyone gets, right or wrong.
  await supabaseAdmin.from("system_settings").delete().eq("key", "gmail_oauth_state");

  if (!stored?.value || !state) {
    return NextResponse.redirect(new URL("/admin/settings?gmail=error&reason=csrf", req.url));
  }

  // Ten minutes. An OAuth consent screen takes under a minute to complete; a
  // state older than this is a stale row or a replay, and there was previously
  // no time bound at all — one written months ago stayed valid until used.
  const age = Date.now() - new Date(stored.updated_at as string).getTime();
  if (age > 10 * 60 * 1000) {
    console.warn(`[gmail] oauth state was ${Math.round(age / 60000)} minutes old; refusing`);
    return NextResponse.redirect(new URL("/admin/settings?gmail=error&reason=expired", req.url));
  }

  // Constant-time comparison, matching the Resend webhook. `!==` returns as
  // soon as it finds a differing byte, which leaks how much of a guess was
  // correct — of little use against 32 random bytes, but there is no reason to
  // hand it over.
  const a = Buffer.from(String(stored.value));
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.redirect(new URL("/admin/settings?gmail=error&reason=csrf", req.url));
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    return NextResponse.redirect(new URL("/admin/settings?gmail=connected", req.url));
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(new URL("/admin/settings?gmail=error", req.url));
  }
}
