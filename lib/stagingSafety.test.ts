import { describe, expect, it } from "vitest";
// The runtime reset command is plain ESM so Node can run it without a loader.
import { validateStagingTarget } from "../scripts/staging-safety.mjs";

const ref = "abcdefghijklmnopqrst";
const valid = {
  STAGING_SUPABASE_PROJECT_REF: ref,
  STAGING_NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY: "staging-anon",
  STAGING_SUPABASE_SERVICE_ROLE_KEY: "staging-service",
  STAGING_SUPABASE_DB_URL: `postgresql://postgres:encoded@db.${ref}.supabase.co:5432/postgres`,
  STAGING_ADMIN_PASSWORD: "admin-password",
  STAGING_STAFF_PASSWORD: "staff-password",
  CONFIRM_STAGING_RESET: `reset-${ref}`,
};

describe("hosted staging reset safety", () => {
  it("accepts a target whose API, database and acknowledgement all name staging", () => {
    expect(validateStagingTarget(valid, { NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co" }))
      .toMatchObject({ ref, apiUrl: `https://${ref}.supabase.co` });
  });

  it("refuses a database URL pointing at another project", () => {
    expect(() => validateStagingTarget({
      ...valid,
      STAGING_SUPABASE_DB_URL: "postgresql://postgres:secret@db.productionref.supabase.co:5432/postgres",
    })).toThrow(/does not name/);
  });

  it("refuses any staging credential that equals production", () => {
    expect(() => validateStagingTarget(valid, {
      SUPABASE_SERVICE_ROLE_KEY: "staging-service",
    })).toThrow(/equals production/);
  });

  it("requires an acknowledgement tied to the exact project ref", () => {
    expect(() => validateStagingTarget({ ...valid, CONFIRM_STAGING_RESET: "yes" }))
      .toThrow(/CONFIRM_STAGING_RESET/);
  });
});
