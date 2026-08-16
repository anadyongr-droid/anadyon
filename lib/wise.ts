/**
 * Wise "open link" deposit requests.
 *
 * Wise Business exposes a payment page whose amount, currency and description
 * can be pre-filled from the query string, so a deposit request is a
 * constructed URL — no API, no credentials, no integration:
 *
 *   https://wise.com/pay/business/<handle>?amount=39&currency=EUR&description=…
 *
 * The trade-off against Stripe is that Wise does not call back when the money
 * arrives, so a reservation paid this way has to be reconciled rather than
 * confirming itself.
 */

/**
 * Wise silently rejects a long description: instead of ignoring or truncating
 * it, the payment page renders "We are unable to accept payments at this time",
 * which reads like an account problem rather than a bad parameter.
 *
 * Verified against the live page: 20 characters render fine, 36 fail. Spaces
 * and hyphens are not the issue — length alone is. Kept at the longest value
 * proven to work.
 */
const MAX_DESCRIPTION = 20;

/**
 * The reference a customer quotes when paying.
 *
 * Prefers the booking's own quote reference, which the customer has already
 * seen in their quote email, so the same code appears everywhere. Reservations
 * created directly in the admin panel have no quote, so those fall back to a
 * short code derived from the id.
 */
export function reservationRef(id: string, notes?: string | null): string {
  const fromQuote = notes?.match(/Quote ref:\s*([A-Za-z0-9-]+)/i);
  if (fromQuote) return fromQuote[1].trim().toUpperCase();
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** Fits "Deposit <ref>" into Wise's limit, dropping the word before the ref. */
export function depositDescription(ref: string): string {
  const withLabel = `Deposit ${ref}`;
  if (withLabel.length <= MAX_DESCRIPTION) return withLabel;
  return ref.slice(0, MAX_DESCRIPTION);
}

export interface WiseDepositLink {
  url: string;
  reference: string;
  description: string;
  amount: number;
  currency: string;
}

export function buildWiseDepositLink(opts: {
  handle: string;
  reservationId: string;
  amount: number;
  notes?: string | null;
  currency?: string;
}): WiseDepositLink {
  const currency = opts.currency ?? "EUR";
  const reference = reservationRef(opts.reservationId, opts.notes);
  const description = depositDescription(reference);

  const params = new URLSearchParams({
    // Wise renders the amount as given; two decimals keeps it unambiguous.
    amount: opts.amount.toFixed(2),
    currency,
    description,
  });

  return {
    url: `https://wise.com/pay/business/${encodeURIComponent(opts.handle)}?${params.toString()}`,
    reference,
    description,
    amount: opts.amount,
    currency,
  };
}
