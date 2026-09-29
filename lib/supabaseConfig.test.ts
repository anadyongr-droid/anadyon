import { describe, expect, it } from "vitest";
import { resolveSupabaseRuntimeConfig } from "./supabaseConfig";

describe("Supabase runtime configuration", () => {
  it("uses complete hosted configuration unchanged", () => {
    expect(resolveSupabaseRuntimeConfig({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    })).toEqual({
      url: "https://project.supabase.co",
      anon: "anon",
      service: "service",
      credentialless: false,
    });
  });

  it("permits only a completely credentialless non-staging preview", () => {
    const config = resolveSupabaseRuntimeConfig({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
    });
    expect(config.credentialless).toBe(true);
    expect(config.url).toBe("https://credentialless-preview.invalid");
  });

  it("refuses missing production or staging configuration", () => {
    expect(() => resolveSupabaseRuntimeConfig({ VERCEL_ENV: "production" })).toThrow("incomplete");
    expect(() => resolveSupabaseRuntimeConfig({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
    })).toThrow("incomplete");
  });

  it("refuses a partially configured general preview", () => {
    expect(() => resolveSupabaseRuntimeConfig({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    })).toThrow("incomplete");
  });
});
