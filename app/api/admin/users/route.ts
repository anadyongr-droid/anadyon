import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { ROLES, isRole, type Role } from "@/lib/roles";

/**
 * Managing who can sign in to the admin area.
 *
 * Access is admin-only by omission: proxy.ts refuses `/api/admin/*` to anyone
 * whose role is not "admin" unless the path appears in its STAFF_API list, and
 * this one deliberately does not. The header check below is defence in depth
 * rather than the primary gate — this route can hand out access to the customer
 * database, so it should not be the one place that trusts a single mechanism.
 *
 * Users are invited, never created with a password. Supabase emails the invite
 * and the person chooses their own password, which means no password for an
 * administrator to think up, transmit over WhatsApp, or leave in a note.
 */

/** The proxy deletes this header from the incoming request before setting it. */
const ROLE_HEADER = "x-anadyon-role";

function callerRole(req: NextRequest): string {
  return req.headers.get(ROLE_HEADER) ?? "";
}

/** Identifies the caller, so the route can refuse to let them lock themselves out. */
async function callerId(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

interface Listed {
  id: string;
  email: string;
  role: Role | null;
  mfaEnrolled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  invitePending: boolean;
}

export async function GET(req: NextRequest) {
  if (callerRole(req) !== "admin") return forbidden();

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // listUsers omits factors, so each record is fetched individually to report
  // MFA state honestly. Reading it from the list would report "none" for every
  // account, including ones that are enrolled.
  const users: Listed[] = await Promise.all(
    (data?.users ?? []).map(async (u) => {
      let mfaEnrolled = false;
      try {
        const { data: full } = await supabaseAdmin.auth.admin.getUserById(u.id);
        const factors = (full?.user as { factors?: { status?: string }[] } | undefined)?.factors ?? [];
        mfaEnrolled = factors.some((f) => f.status === "verified");
      } catch {
        // Reported as not enrolled rather than failing the whole list; the
        // column says what was observed, and an unreadable record is not proof
        // of enrolment.
      }
      const role = u.app_metadata?.role;
      return {
        id: u.id,
        email: u.email ?? "",
        role: isRole(role) ? role : null,
        mfaEnrolled,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
        invitePending: !u.last_sign_in_at,
      };
    })
  );

  users.sort((a, b) => a.email.localeCompare(b.email));
  return NextResponse.json({ users, roles: ROLES });
}

/** Invites a new user and assigns their role. */
export async function POST(req: NextRequest) {
  if (callerRole(req) !== "admin") return forbidden();

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const role = body.role ?? "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!isRole(role)) {
    return NextResponse.json({ error: `Role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (existing?.users?.some((u) => u.email?.toLowerCase() === email)) {
    return NextResponse.json({ error: "That address already has an account" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error || !data?.user) {
    return NextResponse.json(
      { error: error?.message ?? "Could not send the invitation" },
      { status: 502 }
    );
  }

  // The role goes on app_metadata, which the account holder cannot edit.
  // Setting it in a second call means a window where the invited user exists
  // with no role — which is precisely the state proxy.ts now refuses, so an
  // invitation accepted mid-window is denied rather than admitted.
  const { error: roleError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role },
  });
  if (roleError) {
    return NextResponse.json(
      { error: `Invited, but the role could not be set: ${roleError.message}` },
      { status: 500 }
    );
  }

  console.info(`[users] ${callerRole(req)} invited ${email} as ${role}`);
  return NextResponse.json({ id: data.user.id, email, role }, { status: 201 });
}

/** Changes an existing user's role. */
export async function PATCH(req: NextRequest) {
  if (callerRole(req) !== "admin") return forbidden();

  let body: { id?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, role } = body;
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  if (!isRole(role ?? "")) {
    return NextResponse.json({ error: `Role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
  }

  const me = await callerId();
  if (me && me.id === id) {
    // An administrator demoting themselves would be locked out of this very
    // screen, with no one able to undo it except through the Supabase console.
    return NextResponse.json(
      { error: "You cannot change your own role. Ask another administrator." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    app_metadata: { role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.info(`[users] role for ${id} set to ${role}`);
  return NextResponse.json({ id, role });
}

/** Removes a user's access entirely. */
export async function DELETE(req: NextRequest) {
  if (callerRole(req) !== "admin") return forbidden();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const me = await callerId();
  if (me && me.id === id) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 409 });
  }

  // Refuse to remove the last administrator. Without this the screen offers a
  // one-click route to an admin area nobody can administer.
  const { data: all } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const admins = (all?.users ?? []).filter((u) => u.app_metadata?.role === "admin");
  if (admins.length <= 1 && admins.some((u) => u.id === id)) {
    return NextResponse.json(
      { error: "This is the only administrator. Promote someone else first." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.info(`[users] removed ${id}`);
  return NextResponse.json({ id });
}
