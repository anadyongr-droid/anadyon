import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  deploymentBoundaryViolations,
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
    expect(violations).toHaveLength(4);
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
