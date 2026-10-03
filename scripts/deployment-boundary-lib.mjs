export const STAGING_PROJECT_REF = "fzycvstifmltxybffinq";

/**
 * The production Supabase project, named here so one file answers "which ref is
 * which" for every control that needs to know.
 *
 * Read from `docs/audits/2026-08-18-prelaunch.md` and
 * `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`, which records that
 * `idfavwwfiuncoudkcfsp.supabase.co` is the host shipped to browsers. It is a
 * public value — it is in the client bundle — so naming it here discloses
 * nothing. What it buys is that a control which must *avoid* production has one
 * place to look, instead of each one carrying its own copy of a 20-character
 * string that nobody would notice was wrong.
 */
export const PRODUCTION_PROJECT_REF = "idfavwwfiuncoudkcfsp";

/**
 * Production hosts an agent session has no business reaching.
 *
 * Deliberately short. It is the production *data plane* — the PostgREST, Auth
 * and Storage endpoint — and not the public website, which agents legitimately
 * read: verifying a published claim against a rendered page is what
 * `DEFINING-STATEMENTS.md` §8 asks for, and §10 makes it a standing task.
 *
 * It also does not include the Supabase dashboard. That is a path under
 * `supabase.com`, and the deny lists these controls use match *hosts*, so
 * excluding the production project's dashboard would mean excluding the staging
 * project's dashboard and the documentation with it. Recorded as a gap rather
 * than papered over: a browser session in the production dashboard is not
 * covered by anything here, and section 16 of
 * `docs/STAGING-AND-OBSERVABILITY-RUNBOOK.md` says what does cover it.
 */
export const PRODUCTION_DENY_HOSTS = [`${PRODUCTION_PROJECT_REF}.supabase.co`];

export const NEVER_ON_PREVIEW = [
  "ANTHROPIC_API_KEY",
  "APIFY_TOKEN",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REDIRECT_URI",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "WISE_BUSINESS_HANDLE",
];

export const GENERAL_PREVIEW_SERVER_KEYS = [
  "AADE_SUBSCRIPTION_KEY",
  "AADE_USER_ID",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const present = (env, key) => Boolean(env[key]?.trim());

/** @param {Readonly<Record<string, string | undefined>>} env */
export function deploymentBoundaryViolations(env = process.env) {
  if (env.VERCEL_ENV !== "preview") return [];

  const branch = env.VERCEL_GIT_COMMIT_REF?.trim();
  const violations = [];

  for (const key of NEVER_ON_PREVIEW) {
    if (present(env, key)) violations.push(`${key} must not be available to Preview deployments`);
  }

  if (branch !== "staging") {
    for (const key of GENERAL_PREVIEW_SERVER_KEYS) {
      if (present(env, key)) violations.push(`${key} is allowed only on the isolated staging branch`);
    }
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
      if (present(env, key)) violations.push(`${key} is allowed only on the isolated staging branch`);
    }
    return violations;
  }

  const stagingUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (stagingUrl !== `https://${STAGING_PROJECT_REF}.supabase.co`) {
    violations.push("staging must use the declared isolated Supabase project");
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!present(env, key)) violations.push(`staging requires ${key}`);
  }
  if (env.AADE_PRODUCTION?.trim().toLowerCase() === "true") {
    violations.push("AADE_PRODUCTION must be false or unset on staging");
  }
  if (present(env, "STRIPE_SECRET_KEY") && !env.STRIPE_SECRET_KEY.trim().startsWith("sk_test_")) {
    violations.push("staging may use only a Stripe test-mode secret key");
  }

  // Email was the one live hole in this boundary, and it was asymmetric in the
  // worst direction: money and tax filings were fenced here — Stripe forced to
  // test mode, AADE forced non-production — while `RESEND_API_KEY` was merely
  // *permitted*, with nothing saying where staging may send.
  //
  // `lib/mailer.ts` already has the mechanism: `MAIL_REDIRECT_TO` sends every
  // message to one address with a `[TEST → …]` subject, and it covers cc and
  // bcc too. **It is opt-in, and nothing required it.** So a staging deployment
  // holding a live Resend key would email real customers a real-looking booking
  // confirmation, and no control in this project would see it — not the
  // production fingerprint, which watches a different database, and not
  // `pgaudit`, which watches reads.
  //
  // Raised by Fable in the 3 October round-2 review as the worst case that is
  // *live today* rather than hypothetical, and confirmed in this file: the rule
  // was absent. It is the Stripe rule's shape, one line later than it should
  // have been.
  if (present(env, "RESEND_API_KEY") && !present(env, "MAIL_REDIRECT_TO")) {
    violations.push(
      "staging may send email only with MAIL_REDIRECT_TO set, or with no RESEND_API_KEY — otherwise it reaches real customers",
    );
  }

  return violations;
}
