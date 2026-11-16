import { isAuthorisedCron } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";
import { syncEmails } from "@/lib/emailSync";

export const maxDuration = 60;

// Vercel cron calls this route — secured via CRON_SECRET
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same reasoning as the briefing: stop with time in hand to save the cursor.
  const result = await syncEmails({ budgetMs: 45_000 });
  return NextResponse.json({ ok: true, ...result });
}
