import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Pages staff can access (exact page, or a nested route beneath it)
const STAFF_PAGES = ["/admin", "/admin/calendar", "/admin/reservations"];
// API routes staff can call
const STAFF_API = ["/api/admin/reservations"];

// Header used to hand the resolved role to server components. Stripped from the
// incoming request first so a client cannot spoof it.
const ROLE_HEADER = "x-anadyon-role";

function isAllowedPage(pathname: string) {
  return STAFF_PAGES.some(p => pathname === p || (p !== "/admin" && pathname.startsWith(p + "/")));
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

  // TEMPORARY DIAGNOSTIC — reports only the caller's own resolved role. Remove after verification.
  if (pathname === "/api/admin/__rolecheck") {
    return NextResponse.json({ role, jwtRole: user.app_metadata?.role ?? null, userId: user.id });
  }

  // TEMPORARY DIAGNOSTIC — proves the role header reaches server-side handlers. Remove after verification.
  if (pathname === "/api/admin/headercheck-diag") {
    requestHeaders.set(ROLE_HEADER, role);
    const diag = NextResponse.next({ request: { headers: requestHeaders } });
    res.cookies.getAll().forEach(c => diag.cookies.set(c));
    return diag;
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
      const allowed = STAFF_API.some(p => pathname.startsWith(p));
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (!isAllowedPage(pathname)) {
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
