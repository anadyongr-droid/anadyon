import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  deploymentBoundaryViolations,
  GENERAL_PREVIEW_SERVER_KEYS,
  NEVER_ON_PREVIEW,
  STAGING_PROJECT_REF,
} from "../scripts/deployment-boundary-lib.mjs";

describe("deployment credential boundary", () => {
  it("does not interfere with local or production builds", () => {
    expect(deploymentBoundaryViolations({ VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "secret" })).toEqual([]);
    expect(deploymentBoundaryViolations({})).toEqual([]);
  });

  it("refuses credentials on a general preview", () => {
    const violations = deploymentBoundaryViolations({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      STRIPE_SECRET_KEY: "sk_live_secret",
      TELEGRAM_BOT_TOKEN: "token",
    });
    // Named rather than counted. `toHaveLength(4)` passed whether or not the
    // right four were reported, and it breaks for the wrong reason the moment
    // a key is added to either list.
    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining("TELEGRAM_BOT_TOKEN"),
      expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
      expect.stringContaining("STRIPE_SECRET_KEY"),
      expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL"),
    ]));
  });

  // A literal, checked-in copy of both lists.
  //
  // This exists because the `it.each` cases below are NOT enough on their own,
  // which is worth stating plainly: they generate one case per entry FROM the
  // list they are meant to guard, so deleting an entry silently deletes its own
  // test and the remainder still pass. Verified — removing TWILIO_AUTH_TOKEN
  // took the suite from 25 cases to 24 green ones. A guard derived from the
  // thing it guards cannot detect that thing shrinking.
  //
  // So the contents are asserted against a copy that does not move when the
  // implementation does. Adding a key here is a deliberate two-line edit;
  // losing one is a failure.
  it("carries exactly the keys the audit put on each list", () => {
    expect([...NEVER_ON_PREVIEW].sort()).toEqual([
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
    ]);
    expect([...GENERAL_PREVIEW_SERVER_KEYS].sort()).toEqual([
      "AADE_SUBSCRIPTION_KEY",
      "AADE_USER_ID",
      "CRON_SECRET",
      "RESEND_API_KEY",
      "RESEND_WEBHOOK_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  // The two lists ARE the control, and the cases above sample them: only
  // TELEGRAM_BOT_TOKEN and GMAIL_CLIENT_SECRET of eleven never-on-preview keys
  // were exercised, and only SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY of
  // eight server keys. Deleting any of the other thirteen — by edit, by a bad
  // merge, by a typo — left every test passing. Verified by deleting
  // TWILIO_AUTH_TOKEN, which changed nothing. Each entry is now its own case.
  it.each(NEVER_ON_PREVIEW)("keeps %s off every preview", (key) => {
    for (const ref of ["feature", "staging"]) {
      const violations = deploymentBoundaryViolations({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: ref,
        NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        [key]: "leaked",
      });
      expect(violations, `${key} was not refused on the ${ref} branch`).toEqual(
        expect.arrayContaining([expect.stringContaining(key)]),
      );
    }
  });

  it.each(GENERAL_PREVIEW_SERVER_KEYS)("keeps %s off a general preview", (key) => {
    const violations = deploymentBoundaryViolations({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
      [key]: "leaked",
    });
    expect(violations, `${key} was not refused on a general preview`).toEqual(
      expect.arrayContaining([expect.stringContaining(key)]),
    );
  });

  // The credentialless path: this is what lets an ordinary pull-request preview
  // build at all, and it was proven only by a successful Vercel deploy. A
  // regression would have surfaced as a failed deployment rather than a failed
  // test.
  it("allows a general preview that carries no credentials at all", () => {
    expect(deploymentBoundaryViolations({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
    })).toEqual([]);
  });

  it("accepts the isolated staging Supabase project", () => {
    expect(deploymentBoundaryViolations({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      STRIPE_SECRET_KEY: "sk_test_example",
      AADE_PRODUCTION: "false",
    })).toEqual([]);
  });

  it("refuses production integrations on staging", () => {
    const violations = deploymentBoundaryViolations({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      STRIPE_SECRET_KEY: "sk_live_example",
      AADE_PRODUCTION: "true",
      GMAIL_CLIENT_SECRET: "secret",
    });
    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining("GMAIL_CLIENT_SECRET"),
      expect.stringContaining("declared isolated Supabase project"),
      expect.stringContaining("AADE_PRODUCTION"),
      expect.stringContaining("Stripe test-mode"),
    ]));
  });

  it("keeps database URLs behind captured and redacted runners", () => {
    const backup = readFileSync(".github/workflows/backup.yml", "utf8");
    const reset = readFileSync("scripts/reset-staging.mjs", "utf8");

    expect(backup).toContain("node scripts/safe-supabase-backup.mjs");
    expect(backup).not.toContain('supabase db dump --db-url "$SUPABASE_DB_URL"');
    expect(reset).toContain("spawnSync(cli");
    expect(reset).not.toContain('{ cwd: root, stdio: "inherit" }');
  });
});
