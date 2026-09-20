import { describe, expect, it } from "vitest";
import { deploymentIdentity } from "./deploymentIdentity";

describe("deploymentIdentity", () => {
  it("returns the deployed commit, environment and Supabase project ref", () => {
    expect(deploymentIdentity({
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://fzycvstifmltxybffinq.supabase.co",
    })).toEqual({
      commit: "abc123",
      environment: "preview",
      supabaseProjectRef: "fzycvstifmltxybffinq",
    });
  });

  it("does not disclose a URL or other environment values", () => {
    const identity = deploymentIdentity({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid/path?secret=value",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "must-not-appear",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-appear-either",
    });

    expect(identity).toEqual({
      commit: "unavailable",
      environment: "local",
      supabaseProjectRef: "unavailable",
    });
    expect(JSON.stringify(identity)).not.toContain("must-not-appear");
    expect(JSON.stringify(identity)).not.toContain("example.invalid");
  });
});
