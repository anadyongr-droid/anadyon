import { NextRequest, NextResponse } from "next/server";
import { runWatchdog } from "@/lib/emailSync";

export const maxDuration = 60;

// Alerts on open emails older than 4 hours with no reply.
// Also invoked by the daily briefing cron, which is the only scheduled run on
// the Vercel Hobby plan. Kept as its own route so it can be triggered directly.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWatchdog();
  return NextResponse.json({ ok: true, ...result });
}
