import { NextResponse } from "next/server";
import { getAuthUrl, getStoredTokens } from "@/lib/gmail";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/gmail — returns auth URL for Gmail OAuth connect
export async function GET() {
  const tokens = await getStoredTokens();
  if (tokens) {
    return NextResponse.json({ connected: true });
  }
  const { url, state } = getAuthUrl();
  // Persist CSRF state so the callback can verify it
  await supabaseAdmin.from("system_settings").upsert({
    key: "gmail_oauth_state",
    value: state,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ connected: false, authUrl: url });
}

// DELETE /api/admin/gmail — disconnect Gmail
export async function DELETE() {
  await supabaseAdmin.from("system_settings").delete().eq("key", "gmail_tokens");
  return NextResponse.json({ ok: true });
}
