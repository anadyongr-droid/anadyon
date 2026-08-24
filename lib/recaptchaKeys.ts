/**
 * Which reCAPTCHA keys this deployment uses, and the rule that keeps the test
 * pair away from the live site.
 *
 * The booking and contact forms are the only unauthenticated write paths on
 * the site, and reCAPTCHA is what stops them being scripted. That protection
 * is also what makes the booking flow impossible to exercise automatically —
 * a real token needs a human. Google publishes a key pair that always passes
 * for exactly this reason, meant for test environments only.
 *
 * Using them is safe on a Preview deployment and catastrophic on the live
 * site: every submission would verify, and the form would be wide open. So the
 * choice is not left to configuration alone — `verifyRecaptcha` refuses the
 * test secret outright when it detects it is running as the real site.
 */

/** Google's published test pair. Always passes; never valid in production. */
export const RECAPTCHA_TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
export const RECAPTCHA_TEST_SECRET_KEY = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

/** The real key, kept as the default so an unset variable changes nothing. */
export const RECAPTCHA_LIVE_SITE_KEY = "6Lc_mjwtAAAAAKDT-iW8Lu9rql51ldO87Y9NQCvL";

/**
 * The hostname Google reports back for a token solved with the test key.
 * The real hostname check cannot apply to it, since no real domain issued it.
 */
export const RECAPTCHA_TEST_HOSTNAME = "testkey.google.com";

/**
 * True when this is the real anadyon.gr deployment.
 *
 * `VERCEL_ENV` is the precise answer on Vercel — "production", "preview" or
 * "development". Off Vercel it is unset, so `NODE_ENV` decides: a self-hosted
 * production build must still refuse the test keys, and a local `npm run dev`
 * must not.
 */
export function isLiveSite(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * The site key the forms should render.
 *
 * Falls back to the live key, so a deployment with no variable set behaves
 * exactly as it did before this existed.
 */
export function recaptchaSiteKey(): string {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || RECAPTCHA_LIVE_SITE_KEY;
}

/** True when the configured secret is Google's test one. */
export function usingTestSecret(secret: string | undefined): boolean {
  return secret?.trim() === RECAPTCHA_TEST_SECRET_KEY;
}
