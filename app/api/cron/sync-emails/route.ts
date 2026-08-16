import { NextRequest, NextResponse } from "next/server";
import { syncEmails } from "@/lib/emailSync";

export const maxDuration = 60;

// Vercel cron calls this route — secured via CRON_SECRET
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncEmails();
  return NextResponse.json({ ok: true, ...result });
}
