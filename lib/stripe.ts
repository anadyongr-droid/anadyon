import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      // Must match the version the *lockfile's* stripe expects, which is what
      // CI installs with `npm ci`. Do not "fix" a local mismatch by editing
      // this literal: a sandbox that ran `npm install` resolves the caret in
      // package.json to a newer SDK and reports the error inverted, and
      // following it breaks the build for everyone else. Run `npm ci` instead.
      // This literal moves only when the lockfile's stripe version moves.
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return _stripe;
}

// Convenience alias for backwards compat
export const stripe = { get: getStripe };

