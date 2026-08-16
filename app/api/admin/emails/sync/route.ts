import { NextResponse } from "next/server";
import { syncEmails, detectReplies } from "@/lib/emailSync";

// Manual "Sync now" from the Inbox. Auth is enforced by proxy.ts, which admits
// signed-in staff and admins to /api/admin/emails/*.
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncEmails();

    // Also reconcile threads answered from Gmail. Isolated so a failure here
    // still returns the mail that was successfully imported.
    let replied = 0;
    try {
      ({ replied } = await detectReplies());
    } catch (err) {
      console.error("sync: reply detection failed", err);
    }

    return NextResponse.json({ ok: true, ...result, replied });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    // Surfaced in the Inbox so a missing Gmail connection is visible, not silent.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
