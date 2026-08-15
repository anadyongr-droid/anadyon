import { NextResponse } from "next/server";
import { getAuthUrl, getStoredTokens } from "@/lib/gmail";

// GET /api/admin/gmail — returns auth URL for Gmail OAuth connect
export async function GET() {
  const tokens = await getStoredTokens();
  if (tokens) {
    return NextResponse.json({ connected: true });
  }
  const authUrl = getAuthUrl();
  return NextResponse.json({ connected: false, authUrl });
}
