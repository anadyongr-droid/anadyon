import { NextResponse } from "next/server";
import { reclassifyEmails } from "@/lib/emailSync";

// Re-runs classification over emails stored without a summary. Auth is enforced
// by proxy.ts, which admits signed-in staff and admins to /api/admin/emails/*.
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await reclassifyEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-classify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
