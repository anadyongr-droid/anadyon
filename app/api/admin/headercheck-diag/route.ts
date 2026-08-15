import { NextResponse } from "next/server";
import { headers } from "next/headers";

// TEMPORARY DIAGNOSTIC — echoes the role header set by proxy.ts, using the exact
// same mechanism app/admin/layout.tsx relies on. Remove after verification.
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  return NextResponse.json(
    { seenByServerComponent: h.get("x-anadyon-role") },
    { headers: { "cache-control": "no-store" } }
  );
}
