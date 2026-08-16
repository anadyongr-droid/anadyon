import { NextResponse } from "next/server";
import { syncEmails } from "@/lib/emailSync";

// Manual "Sync now" from the Inbox. Auth is enforced by proxy.ts, which admits
// signed-in staff and admins to /api/admin/emails/*.
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    // Surfaced in the Inbox so a missing Gmail connection is visible, not silent.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
