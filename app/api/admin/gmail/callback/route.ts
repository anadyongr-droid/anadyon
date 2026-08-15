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

  // Verify CSRF state
  const { data: stored } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "gmail_oauth_state")
    .maybeSingle();

  if (!stored?.value || stored.value !== state) {
    return NextResponse.redirect(new URL("/admin/settings?gmail=error&reason=csrf", req.url));
  }

  // Clear the state so it can't be replayed
  await supabaseAdmin.from("system_settings").delete().eq("key", "gmail_oauth_state");

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
