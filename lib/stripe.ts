import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      // Kept in step with the installed SDK, which narrows this field to the
      // single API version it was generated against — so a floating `^22.5.0`
      // that resolves to a newer patch breaks the typecheck on main until this
      // literal follows it.
      //
      // Changing this string changes which API version Stripe actually serves,
      // so it is not a formality. Both this and the version it replaces are
      // `.dahlia` monthly releases, and Stripe's versioning policy states that
      // releases within a train are backward-compatible. Casting the old string
      // to silence the compiler was the other option and is worse: it would
      // keep the types quiet while the SDK sent the newer version anyway.
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return _stripe;
}

// Convenience alias for backwards compat
export const stripe = { get: getStripe };

