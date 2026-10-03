import { describe, expect, it } from "vitest";
import { unsafeDeliveryReason } from "./mailer";
import { deploymentBoundaryViolations } from "../scripts/deployment-boundary-lib.mjs";

/**
 * A deployment that is not production must not be able to email a real customer.
 *
 * **This was the one hole in the boundary that was live rather than theoretical,
 * and it was asymmetric in the worst direction.** `deployment-boundary-lib`
 * forced Stripe into test mode on staging and AADE out of production mode, and
 * then merely *permitted* `RESEND_API_KEY` with nothing saying where staging may
 * send. `lib/mailer.ts` already had the mechanism — `MAIL_REDIRECT_TO` sends
 * every message to one address, cc and bcc included — but it was **opt-in**, so
 * a staging deployment with a live key would send a real-looking booking
 * confirmation to a real customer.
 *
 * **And no control in this project would have seen it.** The nightly production
 * fingerprint watches a different database; `pgaudit` watches reads; the gate
 * watches tool calls. Raised by Fable in the 3 October round-two review as the
 * worst case that is live today, and confirmed by reading the code rather than
 * assumed: the rule was absent.
 *
 * Two layers, because each catches what the other cannot:
 *
 * - the **boundary check** refuses the *configuration*, and runs where it is
 *   called — the preflight, CI;
 * - `unsafeDeliveryReason` refuses the *send*, so a deployment that slipped past
 *   the first still cannot reach a customer.
 *
 * Production is deliberately untouched by both.
 */
const staging = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "staging",
  NEXT_PUBLIC_SUPABASE_URL: "https://fzycvstifmltxybffinq.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("the staging boundary refuses a mail configuration that can reach customers", () => {
  it("rejects a Resend key with no redirect", () => {
    const violations = deploymentBoundaryViolations({ ...staging, RESEND_API_KEY: "re_live_key" });
    expect(violations.join(" ")).toMatch(/MAIL_REDIRECT_TO/);
  });

  it("accepts the same key once every message is redirected", () => {
    const violations = deploymentBoundaryViolations({
      ...staging,
      RESEND_API_KEY: "re_live_key",
      MAIL_REDIRECT_TO: "tasos@example.invalid",
    });
    expect(violations).toEqual([]);
  });

  it("accepts staging with no mail credential at all", () => {
    expect(deploymentBoundaryViolations(staging)).toEqual([]);
  });

  it("still refuses a Resend key on any other preview branch", () => {
    // Unchanged behaviour, asserted so the new rule cannot be read as having
    // relaxed the older one: outside `staging`, the key is not allowed at all,
    // redirect or no redirect.
    const violations = deploymentBoundaryViolations({
      ...staging,
      VERCEL_GIT_COMMIT_REF: "codex/some-branch",
      RESEND_API_KEY: "re_live_key",
      MAIL_REDIRECT_TO: "tasos@example.invalid",
    });
    expect(violations.join(" ")).toMatch(/RESEND_API_KEY is allowed only on the isolated staging branch/);
  });
});

describe("the mailer refuses the send itself", () => {
  it("refuses from a preview or staging deployment with no redirect", () => {
    expect(unsafeDeliveryReason({ VERCEL_ENV: "preview" }, undefined)).toMatch(/would reach the real recipient/);
    expect(unsafeDeliveryReason({ VERCEL_ENV: "development" }, undefined)).toMatch(/refusing to send/);
  });

  it("allows it once the redirect that will actually be applied is in force", () => {
    expect(unsafeDeliveryReason({ VERCEL_ENV: "preview" }, "tasos@example.invalid")).toBeNull();
  });

  it("NEVER interferes with production, or with a local run or a test", () => {
    // The guard must not become the reason a booking confirmation fails to
    // reach a customer. Production returns immediately; so does an environment
    // with no VERCEL_ENV, which is every local run and every test in this suite.
    expect(unsafeDeliveryReason({ VERCEL_ENV: "production" }, undefined)).toBeNull();
    expect(unsafeDeliveryReason({}, undefined)).toBeNull();
    expect(unsafeDeliveryReason({ VERCEL_ENV: "  " }, undefined)).toBeNull();
  });
});
