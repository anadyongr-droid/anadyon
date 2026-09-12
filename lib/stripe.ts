import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      // Kept in step with the installed SDK, which narrows this field to the
      // single API version it was generated against — so a floating `^22.5.0`
      // that resolves to a newer patch breaks the typecheck on main until this
      // literal follows it. Both are `.dahlia` monthly releases, and Stripe's
      // versioning policy states that releases within a train are
      // backward-compatible. Open item R1; the same fix is on #96.
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return _stripe;
}

// Convenience alias for backwards compat
export const stripe = { get: getStripe };

