# NBG Pay and Key2Pay integration gate

Status: bank onboarding required before code can safely be connected or deployed.

## Product roles

- **NBG Pay e-Commerce** is the appropriate product for card checkout from the
  Anadyon website. The customer should be redirected to an NBG-hosted payment
  page with EMV 3-D Secure / Strong Customer Authentication. Anadyon must never
  collect or log the card number, CVC or authentication data.
- **Key2Pay** is NBG Pay's remote payment-order service for sales by email or
  telephone, including businesses without an e-shop or POS. It fits the staff
  workflow for sending a deposit request. NBG's public material describes a
  managed portal and emailed payment order; it does not publish a supported
  public API that this repository can implement against without bank-issued
  documentation.

These are complementary workflows, not two interchangeable APIs.

## Official onboarding

Apply for e-Commerce and Key2Pay through NBG Business Internet Banking or an
NBG branch. NBG states that the application is assessed, contractual documents
must be signed, and activation instructions are then sent by email.

Official sources:

- https://www.nbg.gr/en/business/banking-products-services/digital-banking/everyday-transactions/e-commerce-key2pay
- https://www.nbg.gr/en/business/banking-products-services/standing-orders/e-commerce-services
- https://www.nbg.gr/en/business/banking-products-services/standing-orders/e-commerce-services/key2pay

## Information Anadyon must receive from NBG Pay

Do not begin live implementation until NBG Pay supplies all applicable items:

1. selected e-Commerce product and technical integration manual;
2. sandbox and production endpoints;
3. merchant and terminal identifiers;
4. test credentials and production credentials;
5. request-signing or MAC/hash specification and exact character encoding;
6. hosted-payment redirect/return parameters;
7. server-to-server callback/webhook specification and retry rules;
8. payment-status query, cancellation, refund and reconciliation APIs;
9. test cards and required approval scenarios, including failed and challenged
   3-D Secure;
10. allowed return/callback domains for Preview and Production;
11. settlement currency, fees, instalment rules and payout schedule;
12. Key2Pay API documentation, if NBG offers API access for the approved
    account; otherwise Key2Pay remains a controlled staff portal workflow.

Credentials belong only in Vercel encrypted environment variables, scoped
separately to Preview and Production. They must never be committed to GitHub.

## Intended implementation after onboarding

1. Add an NBG Pay provider adapter behind the existing deposit-payment
   interface; do not remove Stripe during the pilot.
2. Create a payment order from the server using the reservation ID, amount,
   currency and an idempotency key.
3. Redirect the customer only to the bank-hosted payment page.
4. Verify every callback cryptographically and independently query payment
   status when the bank supports it.
5. Store provider, provider transaction ID, amount, currency, status and
   timestamps. Never store PAN/CVC.
6. Mark a deposit paid only from a verified server-to-server event or verified
   status query—not from the browser success redirect.
7. Make callbacks replay-safe, validate amount/currency/reservation, and reject
   stale or mismatched events.
8. Add audit logs, refund/cancellation handling and daily settlement
   reconciliation.
9. Test in Preview with NBG's sandbox matrix; then enable Production with a
   small controlled payment and immediate reconciliation.
10. Keep Stripe available for rollback until NBG Pay has completed a stable
    production observation window.

## Current release boundary

The customer-field/date/flight release must not contain a guessed NBG endpoint,
placeholder payment route or simulated success response. That would create a
false impression that card payments are protected when no bank contract,
credentials or signature specification has been supplied.

