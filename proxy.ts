import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isStaffApi, isStaffPage } from "@/lib/adminAccess";

// Header used to hand the resolved role to server components. Stripped from the
// incoming request first so a client cannot spoof it.
const ROLE_HEADER = "x-anadyon-role";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Strip the role header before anything else — including before the public
  // early returns below, which would otherwise forward a client-supplied one
  // straight to the layout that trusts it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(ROLE_HEADER);

  // Cookies Supabase asks us to write while refreshing the session. They have to
  // be replayed onto whichever response we return: dropping them on a redirect
  // loses the rotated refresh token and signs the user out on the next request.
  const refreshed: { name: string; value: string; options: CookieOptions }[] = [];
  function withCookies<T extends NextResponse>(res: T) {
    refreshed.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  }
  const forward = () => withCookies(NextResponse.next({ request: { headers: requestHeaders } }));

  // Always public
  if (pathname === "/admin/login") return forward();
  if (pathname === "/admin/setup-mfa") return forward();
  // The public booking form and quote pages price against the rate card
  if (pathname === "/api/admin/rates" && req.method === "GET") return forward();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach((cookie) => {
            req.cookies.set(cookie.name, cookie.value);
            refreshed.push(cookie);
          }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return withCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return withCookies(NextResponse.redirect(url));
  }

  // Resolve role first so it can be reused below.
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
      return withCookies(NextResponse.json({ error: "MFA setup required" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/setup-mfa";
    return withCookies(NextResponse.redirect(url));
  }

  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    // Factor enrolled but not yet verified in this session
    if (pathname.startsWith("/api/")) {
      return withCookies(NextResponse.json({ error: "MFA verification required" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("mfa", "1");
    return withCookies(NextResponse.redirect(url));
  }

  if (role !== "admin") {
    if (pathname.startsWith("/api/admin/")) {
      if (!isStaffApi(pathname, req.method)) {
        return withCookies(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }
    } else if (!isStaffPage(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/reservations";
      return withCookies(NextResponse.redirect(url));
    }
  }

  // Hand the resolved role to server components. The proxy is the only place
  // that can refresh auth cookies, so it is the authoritative resolver.
  requestHeaders.set(ROLE_HEADER, role);
  return forward();
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
