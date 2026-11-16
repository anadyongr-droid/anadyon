import { isAuthorisedCron } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";
import { runWatchdog } from "@/lib/emailSync";

export const maxDuration = 60;

// Alerts on open emails older than 4 hours with no reply.
// Also invoked by the daily briefing cron, which is the only scheduled run on
// the Vercel Hobby plan. Kept as its own route so it can be triggered directly.
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWatchdog();
  return NextResponse.json({ ok: true, ...result });
}
