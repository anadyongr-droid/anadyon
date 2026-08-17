import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Pages staff can access (exact page, or a nested route beneath it).
// Must mirror the `adminOnly: false` entries in app/admin/AdminLayoutClient.tsx.
// Never add a bare "/admin" here — "/admin/" prefix-matches every admin page.
const STAFF_PAGES = [
  // The screen staff work from; nothing financial is shown on it.
  "/admin/today",
  "/admin/calendar",
  "/admin/reservations",
  "/admin/quotes",
  "/admin/customers",
  "/admin/inbox",
];

// API routes staff can call — the data those pages need to function.
// Deliberately excludes /api/admin/aade, /invoices, /sms, /stripe and /stats.
const STAFF_API = [
  "/api/admin/operations",
  "/api/admin/reservations",
  "/api/admin/vehicles",
  "/api/admin/quotes",
  "/api/admin/customers",
  "/api/admin/emails",
  "/api/admin/documents",
];

// Header used to hand the resolved role to server components. Stripped from the
// incoming request first so a client cannot spoof it.
const ROLE_HEADER = "x-anadyon-role";

// Exact segment match: "/x" matches "/x" and "/x/…" but never "/xyz".
function matchesAny(pathname: string, allowed: string[]) {
  return allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always public
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname === "/admin/setup-mfa") return NextResponse.next();
  if (pathname === "/api/admin/rates" && req.method === "GET") return NextResponse.next();

  // Build a response we can attach cookie refreshes to
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(ROLE_HEADER);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // Resolve role first so it can be reported and reused below.
  // app_metadata is server-only (not editable by the user); never use user_metadata for auth decisions
  let role = (user.app_metadata?.role ?? "") as string;

  // A session issued before a role change carries a stale (or absent) claim.
  // Fall back to the authoritative value in the database.
  if (!role) {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase");
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
      role = (adminUser?.user?.app_metadata?.role as string | undefined) ?? "staff";
    } catch {
      role = "staff";
    }
  }

  // Enforce MFA: all admin users must have a TOTP factor enrolled and verified
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasFactor = (factors?.totp?.length ?? 0) > 0;

  if (!hasFactor) {
    // No factor enrolled — force setup
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "MFA setup required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/setup-mfa";
    return NextResponse.redirect(url);
  }

  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    // Factor enrolled but not yet verified in this session
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "MFA verification required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("mfa", "1");
    return NextResponse.redirect(url);
  }

  if (role !== "admin") {
    if (pathname.startsWith("/api/admin/")) {
      if (!matchesAny(pathname, STAFF_API)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!matchesAny(pathname, STAFF_PAGES)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/reservations";
      return NextResponse.redirect(url);
    }
  }

  // Hand the resolved role to server components. The proxy is the only place
  // that can refresh auth cookies, so it is the authoritative resolver.
  requestHeaders.set(ROLE_HEADER, role);
  const out = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.getAll().forEach(c => out.cookies.set(c));
  return out;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
