/**
 * Verifies a reCAPTCHA token with Google.
 *
 * Three things this now does that it did not:
 *
 * It bounds the request. The fetch had no timeout, so a slow response from
 * Google held a serverless invocation open for as long as it took — on the
 * booking and contact endpoints, which are the two a customer waits on.
 *
 * It checks the hostname. `success === true` only says the token is a valid
 * token; it says nothing about where it was solved. Google returns the
 * hostname it was issued for, and without checking it a token obtained on
 * another site using the same site key would pass here.
 *
 * It decides deliberately what to do when Google cannot be reached, rather
 * than throwing and letting the caller guess.
 */

/** Long enough for a slow answer, short enough not to hold a booking open. */
import { RECAPTCHA_TEST_HOSTNAME, isLiveSite, usingTestSecret } from "@/lib/recaptchaKeys";

const TIMEOUT_MS = 5000;

/**
 * Where a token may legitimately have been solved.
 *
 * The apex domain is the real site. Vercel preview hostnames are included
 * because the same site key is used there and testing the booking form on a
 * preview is routine; they are matched by suffix rather than listed, since
 * every deployment gets its own.
 */
function hostnameAllowed(hostname: string | undefined): boolean {
  if (!hostname) return false;
  if (hostname === "anadyon.gr" || hostname === "www.anadyon.gr") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  // reCAPTCHA reports "localhost" for local development.
  if (hostname === "localhost" && process.env.NODE_ENV !== "production") return true;
  return false;
}

interface SiteVerifyResponse {
  success?: boolean;
  hostname?: string;
  score?: number;
  "error-codes"?: string[];
}

export async function verifyRecaptcha(token: string): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.RECAPTCHA_SECRET_KEY ?? "";

  // Google's test secret verifies every token, which is the point of it — and
  // the reason it must never reach the live site, where it would leave the
  // booking and contact forms open to anything that can POST.
  //
  // Refused here rather than trusted to configuration: a Preview-scoped
  // variable copied to Production by accident is a plausible mistake, and its
  // failure mode is silent. This one is loud and stops bookings, which is
  // recoverable in the minute it takes to correct the variable.
  if (usingTestSecret(secret) && isLiveSite()) {
    console.error(
      "[recaptcha] REFUSING ALL SUBMISSIONS: Google's test secret is configured on the live site. " +
      "Every submission would pass verification. Set the real RECAPTCHA_SECRET_KEY in Production.",
    );
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Encoded, because a token is caller-supplied and an unencoded one
      // containing & or = would silently corrupt the request body.
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY ?? "",
        response: token,
      }).toString(),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[recaptcha] siteverify returned ${res.status}`);
      return false;
    }

    const data = (await res.json()) as SiteVerifyResponse;

    if (data.success !== true) {
      console.warn("[recaptcha] token rejected:", (data["error-codes"] ?? []).join(", ") || "no reason given");
      return false;
    }

    // A token from the test key reports Google's own host rather than the site
    // it was solved on, so the real hostname check cannot apply to it. Accepted
    // only because reaching this line already proves we are not the live site —
    // the guard above returns before the request is even made.
    const testKeyHost = usingTestSecret(secret) && data.hostname === RECAPTCHA_TEST_HOSTNAME;

    if (!testKeyHost && !hostnameAllowed(data.hostname)) {
      console.warn(`[recaptcha] token was solved on an unexpected host: ${data.hostname}`);
      return false;
    }

    return true;
  } catch (err) {
    // Fails CLOSED, unlike the rate limiter, and the difference is deliberate.
    //
    // The rate limiter fails open because refusing every booking when its
    // store is briefly unreachable turns a database blip into a total outage
    // of the booking form. A CAPTCHA is the opposite: it exists precisely to
    // separate people from scripts, and treating "we could not check" as "it
    // is a person" removes the control exactly when it might be under load.
    //
    // The durable rate limit still stands behind this, so a Google outage
    // degrades to rate-limited-but-closed rather than unprotected.
    const reason = err instanceof Error && err.name === "AbortError"
      ? `no answer within ${TIMEOUT_MS}ms`
      : String(err).slice(0, 120);
    console.error(`[recaptcha] verification could not complete (${reason}); refusing`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
