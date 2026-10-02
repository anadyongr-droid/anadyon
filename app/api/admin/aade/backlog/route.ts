import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { FILING_FAILED, FILING_STUCK } from "@/lib/filingBacklog";

/**
 * Every reservation whose client-list filing is outstanding — W26.
 *
 * **Why this is its own query rather than a count over the list the screen
 * already has.** `GET /api/admin/reservations` orders by `created_at` descending
 * and sets no explicit limit, so PostgREST applies its own cap and the response
 * is a *window* of the newest rows. The oldest failed filing is therefore
 * precisely the row that falls off the end — and a statutory backlog that
 * silently truncates is the defect §5.3 names, one level along: the operator sees
 * a confident "3 outstanding" while the fourth, from August, is not in the
 * window at all.
 *
 * So this asks the question directly, filtered in the database, and is bounded by
 * how many filings have actually failed rather than by how recent they are.
 *
 * Authentication is the `proxy.ts` matcher on `/api/admin/:path*`, as for every
 * other route under here; there is deliberately no second check in the handler.
 */
export const dynamic = "force-dynamic";

/**
 * A ceiling, so a pathological state cannot return the whole table — but set far
 * above any plausible backlog, and the response says when it was hit rather than
 * quietly returning a short list. A truncated backlog that looks complete is the
 * thing this route exists to avoid.
 */
const MAX_ROWS = 500;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, pickup_date, return_date, status, dcl_status")
    // Oldest pick-up first: the longest-running unfiled rental is the one with
    // the most statutory exposure, so it reads at the top rather than buried
    // under bookings that have not started yet.
    .order("pickup_date", { ascending: true })
    .in("dcl_status", [FILING_FAILED, FILING_STUCK])
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  return NextResponse.json({
    rows,
    // Said out loud. A caller that received exactly MAX_ROWS has an incomplete
    // picture and needs to know, rather than inferring completeness from a
    // successful response.
    truncated: rows.length >= MAX_ROWS,
  });
}
