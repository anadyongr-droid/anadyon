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
  // The public booking form reads the rate card from here, so it is deliberately
  // unauthenticated — but for reads only. HEAD is included because it is a GET
  // without a body: CDNs and uptime monitors use it, and answering 401 to one
  // while answering 200 to the other makes the endpoint look broken to both.
  if (pathname === "/api/admin/rates" && (req.method === "GET" || req.method === "HEAD")) {
    return NextResponse.next();
  }

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

  // Which path answered is the one fact needed to explain an admin landing on
  // the staff menu, and it was never recorded. If the token carries the claim
  // this is free and always correct; if it does not, every admin request
  // depends on a network lookup that can fail — and the failure mode was a
  // silent downgrade. Logged once per request, only when the fast path misses.
  if (!role) {
    console.warn(
      `[proxy] no role claim in token for ${user.email}; falling back to lookup`
    );
  }

  // A session issued before a role change carries a stale (or absent) claim.
  // Fall back to the authoritative value in the database.
  //
  // An unresolved role now denies access. It used to fall back to "staff",
  // described here as denying privilege — but "staff" is not a denial. It
  // reaches /admin/customers, /admin/reservations and /admin/inbox, so an
  // account with no role at all was handed the customer database.
  //
  // That mattered because nothing in this file checks the user against a list
  // of people who work here. The only thing between a stranger and that data
  // was whether they held an account, and signup is enabled on the Supabase
  // project via an anon key published in every visitor's browser bundle. Sign
  // up, confirm your own address, enrol your own authenticator at the setup
  // page this proxy redirects you to, and the role default did the rest.
  //
  // Both real accounts carry an explicit role, so denying the roleless case
  // locks nobody out.
  if (!role) {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase");
      // Retried, because this lookup is now the difference between an admin
      // working and an admin being turned away. One network blip used to
      // silently downgrade the session to "staff" — the admin would land on
      // the staff menu and only see the full one minutes later, once a
      // subsequent request happened to succeed. Denying instead of
      // downgrading fixed the security half and made that same blip a
      // lockout, so the lookup itself has to stop being a coin toss.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: adminUser, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
        if (!error) {
          role = (adminUser?.user?.app_metadata?.role as string | undefined) ?? "";
          lastErr = null;
          break;
        }
        lastErr = error;
        if (attempt < 2) await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
      }
      if (lastErr) throw lastErr;
    } catch (err) {
      // Denying privilege on error is the right default — never resolve upward
      // when the authoritative answer is unavailable. But it used to happen in
      // total silence, which is why an admin could load the staff menu, refresh,
      // and see the full one: the first request had no role claim in its token,
      // this lookup failed transiently, and nothing anywhere recorded it.
      //
      // The denial stands. It is now visible. A transient failure turning a
      // real admin away for one request is recoverable; resolving upward to a
      // role that reads customer data is not.
      console.error(
        `[proxy] role lookup failed for ${user.id}; denying:`,
        err instanceof Error ? err.message : err
      );
      role = "";
    }
  }

  // No role, no access. Roles live in app_metadata, which is server-only and
  // cannot be set by the account holder, so this cannot be satisfied by
  // signing up.
  if (role !== "admin" && role !== "staff") {
    console.error(`[proxy] no role for ${user.id} (${user.email}); refusing admin access`);
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("denied", "1");
    return NextResponse.redirect(url);
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
