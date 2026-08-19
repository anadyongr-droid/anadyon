/**
 * Checks the things that have actually broken quietly.
 *
 * Every item here is drawn from a real incident on this site, not from a
 * generic checklist. Each one was invisible from the outside: the pages
 * rendered, nobody saw an error, and the only evidence sat in a log nobody was
 * reading.
 *
 *   - Google Analytics recorded nothing from launch, because the CSP allowed
 *     www.google-analytics.com and GA4 posts to a regional host.
 *   - The Resend webhook answered 503 to every delivery event for a day,
 *     because its signing secret was never added to the environment. Bounces
 *     went unrecorded.
 *   - An admin account whose role fails to resolve is locked out of its own
 *     admin area.
 *
 * The checks run inside the daily briefing rather than on their own schedule:
 * the Vercel Hobby plan permits exactly one cron, and that route is already the
 * orchestrator for everything scheduled.
 *
 * Anything reported here is a fact about production, gathered by asking
 * production — the CSP is read from a real response, the webhook is really
 * called. A check that reads local configuration would pass while the deployed
 * site disagreed with it, which is precisely the failure being guarded against.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://anadyon.gr";

/** Long enough for a cold function, short enough not to threaten maxDuration. */
const TIMEOUT_MS = 8000;

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The analytics failure, checked the only way that would have caught it:
 * against the header production actually sends.
 */
async function checkAnalyticsReachable(): Promise<CheckResult> {
  const name = "Analytics not blocked by CSP";
  try {
    const csp = await withTimeout(async (signal) => {
      const res = await fetch(SITE, { signal, cache: "no-store" });
      return res.headers.get("content-security-policy") ?? "";
    });
    if (!csp) return { name, ok: false, detail: "no CSP header on the homepage" };

    const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
    // GA4 posts to region1..region14.google-analytics.com depending on where
    // the visitor is, so only the wildcard covers real traffic.
    const missing = ["https://*.google-analytics.com", "https://*.analytics.google.com"]
      .filter((host) => !connect.includes(host));

    return missing.length
      ? { name, ok: false, detail: `connect-src is missing ${missing.join(" and ")} — GA hits are being refused` }
      : { name, ok: true, detail: "regional endpoints allowed" };
  } catch (err) {
    return { name, ok: false, detail: `could not read the CSP: ${String(err).slice(0, 90)}` };
  }
}

/**
 * 503 means the signing secret is absent and every Resend event is being
 * rejected. 401 means it is configured and demanding a valid signature, which
 * is the healthy state.
 */
async function checkResendWebhook(): Promise<CheckResult> {
  const name = "Resend webhook accepting events";
  try {
    const status = await withTimeout(async (signal) => {
      const res = await fetch(`${SITE}/api/resend-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal,
        cache: "no-store",
      });
      return res.status;
    });
    if (status === 503) {
      return { name, ok: false, detail: "RESEND_WEBHOOK_SECRET is not set — bounces and complaints are being discarded" };
    }
    if (status !== 401) {
      return { name, ok: false, detail: `unsigned request answered ${status}, expected 401` };
    }
    return { name, ok: true, detail: "configured, rejecting unsigned events" };
  } catch (err) {
    return { name, ok: false, detail: `unreachable: ${String(err).slice(0, 90)}` };
  }
}

/** No rate card means a booking form with no prices on it. */
async function checkRateCard(): Promise<CheckResult> {
  const name = "Rate card readable";
  try {
    // Imported lazily, as proxy.ts does. lib/supabase builds its clients at
    // module scope and throws without credentials, so an eager import would
    // make this whole module unloadable in a test.
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await supabaseAdmin.from("rates").select("id").limit(1);
    if (error) return { name, ok: false, detail: error.message.slice(0, 110) };
    if (!data?.length) return { name, ok: false, detail: "the rates table is empty" };
    return { name, ok: true, detail: "present" };
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 110) };
  }
}

/**
 * An account whose role does not resolve cannot reach the admin area at all —
 * the proxy refuses it rather than granting staff, which is correct but means
 * a lost role is a lockout rather than a quiet downgrade.
 */
async function checkAdminRoles(): Promise<CheckResult> {
  const name = "Admin accounts have roles";
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) return { name, ok: false, detail: error.message.slice(0, 110) };

    const users = data?.users ?? [];
    const roleless = users.filter((u) => {
      const role = u.app_metadata?.role;
      return role !== "admin" && role !== "staff";
    });
    const admins = users.filter((u) => u.app_metadata?.role === "admin");

    if (!admins.length) {
      return { name, ok: false, detail: "no account holds the admin role — nobody can administer the site" };
    }
    if (roleless.length) {
      const who = roleless.map((u) => u.email ?? u.id).join(", ").slice(0, 120);
      return { name, ok: false, detail: `${roleless.length} account(s) with no usable role, cannot sign in: ${who}` };
    }
    return { name, ok: true, detail: `${admins.length} admin, ${users.length - admins.length} staff` };
  } catch (err) {
    return { name, ok: false, detail: String(err).slice(0, 110) };
  }
}

/**
 * Variables whose absence fails silently rather than loudly. Values are never
 * reported, only whether something is there.
 *
 * This is the weakest of the checks, and knowing why matters: it inspects the
 * process it runs in, whereas the others ask production a question and read
 * the answer. In the cron those are the same environment, so it is accurate
 * there. Run the checks from a laptop and it will report the Vercel-only
 * secrets as missing while the behavioural checks correctly show them working.
 *
 * It earns its place as a backstop — if the site is unreachable, the
 * behavioural checks report that they could not connect, and this one still
 * says whether the configuration behind them is intact.
 */
function checkEnvironment(): CheckResult {
  const name = "Required configuration present";
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
    "RECAPTCHA_SECRET_KEY",
    "CRON_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  return missing.length
    ? { name, ok: false, detail: `not set: ${missing.join(", ")}` }
    : { name, ok: true, detail: `${required.length} variables present` };
}

/** Runs everything. Never throws: a broken check must not break the briefing. */
export async function runHealthChecks(): Promise<CheckResult[]> {
  const checks = await Promise.all([
    checkAnalyticsReachable().catch((e) => ({ name: "Analytics not blocked by CSP", ok: false, detail: String(e).slice(0, 90) })),
    checkResendWebhook().catch((e) => ({ name: "Resend webhook accepting events", ok: false, detail: String(e).slice(0, 90) })),
    checkRateCard().catch((e) => ({ name: "Rate card readable", ok: false, detail: String(e).slice(0, 90) })),
    checkAdminRoles().catch((e) => ({ name: "Admin accounts have roles", ok: false, detail: String(e).slice(0, 90) })),
    Promise.resolve(checkEnvironment()),
  ]);
  return checks;
}

/** The alert text, or null when everything passed and there is nothing to say. */
export function formatHealthAlert(results: CheckResult[]): string | null {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return null;

  const lines = [
    `⚠️ <b>Site health: ${failed.length} of ${results.length} checks failing</b>`,
    "",
    ...failed.map((r) => `❌ <b>${r.name}</b>\n   ${r.detail}`),
    "",
    `<i>Passing: ${results.filter((r) => r.ok).map((r) => r.name).join(", ") || "none"}</i>`,
  ];
  return lines.join("\n");
}
