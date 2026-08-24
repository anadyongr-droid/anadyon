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
  // Reference. Both render read-only for staff — see the `readOnly` prop each
  // page takes. The API enforces it regardless of what the page shows.
  "/admin/rates",
  "/admin/market",
];

/** Methods that only read. Anything not listed here writes. */
const READ_ONLY = ["GET", "HEAD"] as const;

interface StaffRoute {
  /** Matched exactly, or as a prefix followed by "/". */
  path: string;
  /** Omit to allow every method. */
  methods?: readonly string[];
}

/**
 * What staff may call, and with which methods.
 *
 * Method-aware because a path is not a permission: `/api/admin/rates` serves
 * both the rate card and the edit that changes it, so "staff may see prices"
 * and "staff may set prices" were the same URL. Listing the path granted both,
 * which is why viewing rates could not be allowed at all.
 *
 * The principle: staff can do everything a rental needs from enquiry to
 * return, and nothing that decides what things cost.
 */
const STAFF_API: StaffRoute[] = [
  // ─── Servicing a rental, start to finish ───
  { path: "/api/admin/operations" },
  { path: "/api/admin/reservations" },
  { path: "/api/admin/vehicles" },
  { path: "/api/admin/quotes" },
  { path: "/api/admin/customers" },
  { path: "/api/admin/emails" },
  { path: "/api/admin/documents" },

  // ─── Taking payment, and telling the customer about it ───
  // Both create a link for a booking that already has its price; neither can
  // change what is owed.
  { path: "/api/admin/stripe/create-payment-link" },
  { path: "/api/admin/wise/deposit-link" },
  { path: "/api/admin/sms" },

  // ─── Statutory filings for a rental staff handled ───
  // Declaring a rental to AADE and issuing its invoice complete the rental;
  // they are not commercial decisions.
  { path: "/api/admin/aade/submit" },
  { path: "/api/admin/invoices/submit" },

  // ─── Reference only ───
  // The rate card and the competitor comparison are readable. PATCH on either
  // is how prices and competitor mappings change, and stays with an admin.
  { path: "/api/admin/rates", methods: READ_ONLY },
  { path: "/api/admin/competitors/comparison", methods: READ_ONLY },
  { path: "/api/admin/competitors/mapping", methods: READ_ONLY },

  // The three import buttons on Market. These fetch competitors' published
  // prices; none of them touches Anadyon's own.
  { path: "/api/admin/competitors/carrentals" },
  { path: "/api/admin/competitors/faros" },
  { path: "/api/admin/competitors/scrape" },
];

// Deliberately still admin-only: /stats, /users, /settings, /gmail,
// /promo-codes and /discount-rules — the last two decide what a rental costs.
//
// Note that the broad "/api/admin/vehicles" entry above already allows staff
// to PATCH a vehicle and write its ledger. That predates this change and is
// left as it was; narrowing it would remove access nobody asked to remove.
// If fleet editing should be admin-only, restrict that entry to READ_ONLY and
// add explicit entries for the availability and ledger reads staff do need.

// Header used to hand the resolved role to server components. Stripped from the
// incoming request first so a client cannot spoof it.
const ROLE_HEADER = "x-anadyon-role";

// Exact segment match: "/x" matches "/x" and "/x/…" but never "/xyz".
function matchesAny(pathname: string, allowed: string[]) {
  return allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Whether a staff member may make this request.
 *
 * Both the path and the method have to be allowed. A route listed without
 * `methods` permits all of them; one listed with `READ_ONLY` permits reading
 * and refuses every write to the same URL.
 */
function staffMayCall(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  return STAFF_API.some((route) =>
    (pathname === route.path || pathname.startsWith(route.path + "/")) &&
    (!route.methods || route.methods.includes(verb))
  );
}

/**
 * How long any single Supabase Auth call may take before this middleware gives
 * up on it.
 *
 * On 2026-08-23 the admin area became completely unreachable: outbound Auth
 * calls from the middleware stopped completing, and because nothing here had a
 * deadline the invocation ran to the platform's 300-second ceiling and returned
 * MIDDLEWARE_INVOCATION_TIMEOUT. Every admin page and API call behaved the same
 * way, so a slow dependency did not degrade the admin area — it removed it.
 *
 * Eight seconds is far beyond a healthy call (measured at 116–212ms against
 * this project) and far inside any sane request budget.
 *
 * See docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md.
 */
const AUTH_TIMEOUT_MS = 8_000;

/**
 * Bounds one Auth call and reports which way it ended.
 *
 * Returns an outcome rather than throwing or resolving to a null-shaped value,
 * because a timeout must never be mistaken for "Supabase answered, and the
 * answer was no". That distinction is the security question here: an unanswered
 * role lookup has to deny, and it has to deny knowingly rather than by looking
 * like an empty result.
 *
 * The pending call is abandoned rather than cancelled — it cannot be aborted
 * through the Supabase client, and letting it settle later is harmless because
 * the result is discarded.
 */
async function withAuthTimeout<T>(
  label: string,
  work: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; ms: number }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timed-out");

  try {
    const result = await Promise.race([
      work,
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), AUTH_TIMEOUT_MS);
      }),
    ]);

    if (result === timedOut) {
      const ms = Date.now() - started;
      // Timings and labels only — never a token, session or request body.
      console.error(`[proxy] auth call "${label}" did not answer within ${ms}ms; giving up`);
      return { ok: false, ms };
    }
    return { ok: true, value: result as T };
  } catch (err) {
    const ms = Date.now() - started;
    console.error(
      `[proxy] auth call "${label}" failed after ${ms}ms:`,
      err instanceof Error ? err.message : err,
    );
    return { ok: false, ms };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * "We could not verify you" — distinct from "you may not come in".
 *
 * A denial tells the person something about their account; this tells them the
 * check itself did not complete. Keeping them apart matters when the admin area
 * is unreachable: the previous behaviour was a five-minute hang, which told
 * nobody anything.
 */
function authUnavailable(req: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 503 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("unavailable", "1");
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always public
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname === "/admin/setup-mfa") return NextResponse.next();
  // Reached with a session but before a password exists, so before a second
  // factor can possibly be enrolled. Enrolment is enforced immediately after,
  // by the MFA gate below, on the very next page they visit.
  if (pathname === "/admin/set-password") return NextResponse.next();
  // Stripe redirects the customer here after Checkout. The route retrieves the
  // unguessable session from Stripe and applies the same amount/idempotency
  // checks as the signed webhook; requiring an admin session here left paying
  // customers on the staff login screen.
  if (pathname === "/api/admin/stripe/success" && req.method === "GET") {
    return NextResponse.next();
  }
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

  const identified = await withAuthTimeout("getUser", supabase.auth.getUser());
  if (!identified.ok) {
    // Unanswered, so nothing is known about this caller — including whether
    // they are signed in. Never treat that as "signed out" and never as
    // "signed in": say the check failed.
    return authUnavailable(req, pathname);
  }
  const user = identified.value.data.user;

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
      //
      // Each attempt is now bounded. Three unbounded retries were three ways to
      // hang rather than three chances to succeed: on 2026-08-23 this block was
      // where the invocation stopped, and the whole admin area went with it.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const lookup = await withAuthTimeout(
          `getUserById#${attempt + 1}`,
          supabaseAdmin.auth.admin.getUserById(user.id),
        );
        if (!lookup.ok) {
          lastErr = new Error(`role lookup did not answer within ${AUTH_TIMEOUT_MS}ms`);
          // A timeout has already cost the full budget; spending it twice more
          // is how one slow dependency becomes a dead admin area.
          break;
        }
        const { data: adminUser, error } = lookup.value;
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
  // These are independent Supabase Auth reads. Keeping both checks on every
  // protected request preserves the security boundary; issuing them together
  // removes one round trip from every admin page and API call.
  //
  // Kept parallel and now bounded as a pair: one deadline covers both, so the
  // MFA gate costs at most AUTH_TIMEOUT_MS rather than twice that. Running them
  // sequentially would double the cost of the exact path that failed.
  const verified = await withAuthTimeout("mfa", Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]));
  if (!verified.ok) {
    // The MFA state is unknown. Letting the request through would be waving
    // someone past the second factor because the check was slow.
    return authUnavailable(req, pathname);
  }
  const [{ data: aal }, { data: factors }] = verified.value;
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
      if (!staffMayCall(pathname, req.method)) {
        // Named, because "Forbidden" on a page a staff member can plainly see
        // reads as a bug rather than a rule. The rate card is the case that
        // matters: they are meant to look at it and not to change it.
        return NextResponse.json(
          { error: "Forbidden: this action requires an administrator." },
          { status: 403 },
        );
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
