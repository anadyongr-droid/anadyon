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
 * Short, human-quotable reference for a reservation.
 *
 * Reservations carry only a uuid, which nobody will retype correctly into a
 * bank transfer. The first eight hex characters give ~4 billion values — ample
 * here — and stay derivable from the id, so no schema change is needed and a
 * payment can later be matched back with a prefix lookup.
 */
export function reservationRef(id: string): string {
  return `ANA-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export interface WiseDepositLink {
  url: string;
  reference: string;
  amount: number;
  currency: string;
}

export function buildWiseDepositLink(opts: {
  handle: string;
  reservationId: string;
  amount: number;
  currency?: string;
}): WiseDepositLink {
  const currency = opts.currency ?? "EUR";
  const reference = reservationRef(opts.reservationId);

  const params = new URLSearchParams({
    // Wise renders the amount as given; two decimals keeps it unambiguous.
    amount: opts.amount.toFixed(2),
    currency,
    // The payer sees and carries this through, so it is what reconciliation
    // will key on later.
    description: `Anadyon Rentals deposit ${reference}`,
  });

  return {
    url: `https://wise.com/pay/business/${encodeURIComponent(opts.handle)}?${params.toString()}`,
    reference,
    amount: opts.amount,
    currency,
  };
}
