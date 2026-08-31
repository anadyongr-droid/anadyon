import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * TEMPORARY. Diagnostic 10c from docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md.
 *
 * ─── Delete this route once the answer is recorded ───
 *
 * It exists to settle one question, and it should not outlive the answer.
 * Removing it means deleting this file and running:
 *
 *     drop function if exists public.whoami_probe();
 *
 * ─── The question ───
 *
 * §12.4 concluded that Option A probably needs no RLS policy work, because the
 * privileged work still happens inside `SECURITY DEFINER` functions that bypass
 * RLS — what changes hands is *identity*, not *privilege*. That conclusion rests
 * on `auth.uid()` resolving inside a `SECURITY DEFINER` body when the call
 * arrives from a user-scoped client. It should: PostgREST sets the JWT claims
 * per request, and `auth.uid()` reads them regardless of which role the body
 * executes as.
 *
 * "Should" is what this whole document exists to stop relying on. §3 already
 * records one confident belief about `auth.uid()` that turned out to be wrong.
 *
 * ─── Why this route is the test and `supabaseAdmin` is not ───
 *
 * The entire point is the client. Every other admin route reaches Supabase with
 * the service role, under which `auth.uid()` is NULL — that is the defect being
 * worked around. This route builds a per-request client from the session
 * cookies instead, which is the Option A pattern exactly, borrowed from
 * app/api/admin/users/route.ts.
 *
 * If this file ever imports `supabaseAdmin`, it has stopped testing anything.
 * lib/rpcIdentityProbe.test.ts asserts that it does not.
 *
 * ─── Reading the result ───
 *
 *   uid non-null, pg_role "authenticated"  → Option A works. Build it.
 *   uid null                               → Option A is falsified. Option B
 *                                            becomes the answer by elimination,
 *                                            and §12.4's conclusion is wrong.
 *
 * An **administrator** session is enough, and that is deliberate: the mechanism
 * under test is whether JWT claims reach the function at all, which does not
 * depend on which role the claim carries. Adding a throwaway diagnostic to
 * proxy.ts's STAFF_API allowlist to run it as staff would widen the security
 * allowlist for something meant to be deleted next week, and allowlist entries
 * added "temporarily" are how allowlists grow. Unlisted routes under
 * /api/admin/ are admin-only by default, so this needs no role check of its own.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data, error } = await supabase.rpc("whoami_probe");

  if (error) {
    // Reported rather than swallowed: "function does not exist" means the SQL
    // in §12.4 has not been run yet, and that is a different answer from a
    // null uid.
    return NextResponse.json(
      { ok: false, error: error.message, hint: "Run the whoami_probe SQL from §12.4 first." },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    result: row,
    verdict:
      row?.uid
        ? "auth.uid() resolves under a user-scoped client — Option A works."
        : "auth.uid() is NULL — Option A is falsified; see §12.4.",
  });
}
