import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * The four-eyes queue: what staff have proposed, and an administrator's verdict.
 *
 * GET is open to staff on purpose — the person who raised a request should be
 * able to see whether it was approved without asking. It returns the proposal
 * and the verdict, which are their own words and the administrator's, and
 * nothing else about the vehicle.
 *
 * PATCH is administrator-only, and that is the whole point of the feature.
 * proxy.ts admits staff to "/api/admin/vehicles" by prefix, so every route
 * beneath it is in staff reach by default; the check is made here at the point
 * of use, the same way the vehicle ledger does it.
 *
 * Approval does not write the vehicle from here. It calls
 * public.apply_vehicle_change_request, which applies the change and marks the
 * request approved in one transaction — see the migration for why those cannot
 * be two statements.
 */

const ROLE_HEADER = "x-anadyon-role";

function refuseNonAdmin(req: NextRequest): NextResponse | null {
  if (req.headers.get(ROLE_HEADER) === "admin") return null;
  return NextResponse.json(
    { error: "Only an administrator can approve or reject a change." },
    { status: 403 },
  );
}

/**
 * The person acting, from their own session rather than the service role.
 *
 * Same pattern and same caveat as the blocks route: the application's claim
 * about who acted, not a database-verified identity, because `auth.uid()` is
 * NULL under the service role. See docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md.
 */
async function actorId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** GET /api/admin/vehicles/change-requests?status=pending */
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "rejected", "all"].includes(status)) {
    return NextResponse.json({ error: "Unknown status filter." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("vehicle_change_requests")
    .select("id, vehicle_id, changes, before, note, status, requested_at, reviewed_at, review_note, vehicles(name, plate)")
    .order("requested_at", { ascending: status === "pending" })
    .limit(200);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** PATCH — approve or reject. Administrator only. */
export async function PATCH(req: NextRequest) {
  const refused = refuseNonAdmin(req);
  if (refused) return refused;

  const body = await req.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : "";
  const decision = body && typeof body.decision === "string" ? body.decision : "";
  const note = body && typeof body.note === "string" ? body.note : null;

  if (!id) return NextResponse.json({ error: "Which request?" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'." }, { status: 400 });
  }

  const reviewer = await actorId();

  if (decision === "reject") {
    // Rejection writes nothing to the vehicle, so it needs no transaction.
    // Guarded on status so a second press cannot overwrite an approval.
    const { data, error } = await supabaseAdmin
      .from("vehicle_change_requests")
      .update({
        status: "rejected",
        reviewed_by: reviewer,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: "That request has already been decided." },
        { status: 409 },
      );
    }
    return NextResponse.json({ request: data });
  }

  const { data, error } = await supabaseAdmin.rpc("apply_vehicle_change_request", {
    p_request_id: id,
    p_reviewer: reviewer,
    p_note: note,
  });

  if (error) {
    /*
     * The function raises with meaningful SQLSTATEs, and the difference matters
     * to whoever pressed the button:
     *
     *   40001  the vehicle moved since the request was made — not their fault,
     *          and re-reading is the fix, so it is a 409 rather than a 500.
     *   22023  the request names something unwritable, or is already decided.
     *   02000  the request or the vehicle is gone.
     */
    const status =
      error.code === "40001" ? 409
      : error.code === "22023" ? 409
      : error.code === "02000" ? 404
      : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ request: data });
}
