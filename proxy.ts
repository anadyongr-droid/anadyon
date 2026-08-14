import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Pages staff can access
const STAFF_PAGES = ["/admin", "/admin/calendar", "/admin/reservations"];
// API routes staff can call
const STAFF_API = ["/api/admin/reservations"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always public
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname === "/admin/setup-mfa") return NextResponse.next();
  if (pathname === "/api/admin/rates" && req.method === "GET") return NextResponse.next();

  // Build a response we can attach cookie refreshes to
  const res = NextResponse.next({ request: req });

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

  // Enforce MFA completion if the user has enrolled a TOTP factor but hasn't verified it yet
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "MFA verification required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("mfa", "1");
    return NextResponse.redirect(url);
  }

  // Role-based access — default to "staff" if no role set
  const role = (user.user_metadata?.role ?? user.app_metadata?.role ?? "staff") as string;

  if (role !== "admin") {
    if (pathname.startsWith("/api/admin/")) {
      const allowed = STAFF_API.some(p => pathname.startsWith(p));
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const allowed = STAFF_PAGES.some(p => pathname === p || pathname.startsWith(p + "/"));
      if (!allowed) {
        const url = req.nextUrl.clone();
        url.pathname = "/admin/reservations";
        return NextResponse.redirect(url);
      }
    }
  }

  return res;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
