export const STAGING_PROJECT_REF = "fzycvstifmltxybffinq";

const NEVER_ON_PREVIEW = [
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

const GENERAL_PREVIEW_SERVER_KEYS = [
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

  return violations;
}
