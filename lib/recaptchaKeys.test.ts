import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECAPTCHA_LIVE_SITE_KEY,
  RECAPTCHA_TEST_SECRET_KEY,
  RECAPTCHA_TEST_SITE_KEY,
  isLiveSite,
  recaptchaSiteKey,
  usingTestSecret,
} from "./recaptchaKeys";

/**
 * The rule that lets a Preview deployment be tested automatically without
 * opening the live booking form to anything that can POST.
 *
 * Google's test key pair verifies every token. That is the entire point of it,
 * and the reason it must never reach anadyon.gr — reCAPTCHA is the only thing
 * standing in front of the two unauthenticated write paths on the site.
 */
const ENV = { ...process.env };

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  delete process.env.RECAPTCHA_SECRET_KEY;
});

afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe("which deployment is the live site", () => {
  it("is production on Vercel only when VERCEL_ENV says so", () => {
    process.env.VERCEL_ENV = "production";
    expect(isLiveSite()).toBe(true);
  });

  it("is not the live site on a preview or a Vercel dev deployment", () => {
    for (const env of ["preview", "development"]) {
      process.env.VERCEL_ENV = env;
      expect(isLiveSite(), env).toBe(false);
    }
  });

  it("falls back to NODE_ENV when not on Vercel", () => {
    // A self-hosted production build must still refuse the test keys; a local
    // dev server must not be treated as the live site.
    vi.stubEnv("NODE_ENV", "production");
    expect(isLiveSite()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(isLiveSite()).toBe(false);
  });
});

describe("which site key the forms render", () => {
  it("uses the live key when nothing is configured", () => {
    // An unset variable must behave exactly as before this existed.
    expect(recaptchaSiteKey()).toBe(RECAPTCHA_LIVE_SITE_KEY);
  });

  it("uses the configured key when one is set", () => {
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = RECAPTCHA_TEST_SITE_KEY;
    expect(recaptchaSiteKey()).toBe(RECAPTCHA_TEST_SITE_KEY);
  });

  it("ignores an empty or whitespace value rather than rendering a blank key", () => {
    for (const value of ["", "   "]) {
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = value;
      expect(recaptchaSiteKey()).toBe(RECAPTCHA_LIVE_SITE_KEY);
    }
  });
});

describe("recognising the test secret", () => {
  it("matches Google's published test secret, trimmed", () => {
    expect(usingTestSecret(RECAPTCHA_TEST_SECRET_KEY)).toBe(true);
    expect(usingTestSecret(` ${RECAPTCHA_TEST_SECRET_KEY} `)).toBe(true);
  });

  it("does not match a real secret, or nothing at all", () => {
    expect(usingTestSecret("a-real-looking-secret")).toBe(false);
    expect(usingTestSecret("")).toBe(false);
    expect(usingTestSecret(undefined)).toBe(false);
  });

  it("keeps the two keys distinct", () => {
    // A copy-paste that made these equal would disable the guard silently.
    expect(RECAPTCHA_TEST_SITE_KEY).not.toBe(RECAPTCHA_LIVE_SITE_KEY);
  });
});
