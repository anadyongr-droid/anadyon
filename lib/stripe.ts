import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      // Moved from 2026-07-29.dahlia with the SDK bump to 22.6.0, which narrows
      // this type to its own pinned version and made the old string a
      // compile error.
      //
      // Updating the pin changes which API version Stripe actually serves, so
      // it is a vendor migration rather than a formality — checked before
      // changing it. Both are monthly releases on the same `.dahlia` train, and
      // Stripe's versioning policy is that "each monthly release includes only
      // backward-compatible changes, and you can safely upgrade to a new
      // monthly release without breaking any existing code".
      // https://docs.stripe.com/sdks/versioning
      //
      // The alternative — casting the old string to satisfy the compiler —
      // would keep the runtime version and silence the signal. That is worse:
      // it hides the day the pinned version leaves the supported window.
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return _stripe;
}

// Convenience alias for backwards compat
export const stripe = { get: getStripe };

