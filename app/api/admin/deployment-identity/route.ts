import { type NextRequest, NextResponse } from "next/server";
import { deploymentIdentity } from "@/lib/deploymentIdentity";

const ROLE_HEADER = "x-anadyon-role";

/**
 * Admin-only proof of which build and database project are serving a request.
 * proxy.ts enforces the session and MFA gates; this role check is defence in
 * depth and keeps a direct route invocation from becoming public.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get(ROLE_HEADER) !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(deploymentIdentity(), {
    headers: { "Cache-Control": "no-store" },
  });
}
