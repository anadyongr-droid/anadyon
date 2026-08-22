# NBG Pay hosted checkout and Key2Pay handover

Status: code complete behind a disabled feature gate; NBG sandbox onboarding and
migration 031 are required before Preview testing. Production is not enabled.

## Official implementation selected

Anadyon uses NBG's **Hosted Checkout payment-link mode**, API version 100. This
is the bank's documented low-PCI-scope integration:

1. the admin API creates an order with `INITIATE_CHECKOUT`,
   `checkoutMode=PAYMENT_LINK` and `interaction.operation=PURCHASE`;
2. the customer opens only the HTTPS URL returned by NBG;
3. no PAN, CVC, card expiry or 3-D Secure authentication data touches Anadyon;
4. the browser return contains only an opaque Anadyon attempt ID;
5. Anadyon retrieves the order directly from NBG and requires the exact order
   ID, EUR amount, `CAPTURED` status and an approved successful payment;
6. one database transaction records the attempt and confirms the reservation.

Official sources:

- NBG Developer Portal — E-Commerce Enterprise:
  https://developer.nbg.gr/apiProduct/ECommerceEnterprise
- NBG i-bank e-Commerce Enterprise integration guide:
  https://files.nbg.gr/ecommerce/docs/Integration%20Guide%20i-Bank%20e-Enterprise.pdf
- NBG API v100 — Initiate Checkout:
  https://test.ibanke-commerce.nbg.gr/api/documentation/apiDocumentation/rest-json/version/100/operation/Hosted%20Checkout%3A%20Initiate%20Checkout.html?locale=en_US
- NBG API v100 — Retrieve Order:
  https://test.ibanke-commerce.nbg.gr/api/documentation/documentation/apiDocumentation/rest-json/version/100/operation/Transaction%3A%20%20Retrieve%20Order.html?locale=en_US

## Code added

- `lib/nbg.ts` — allow-listed test/production gateway adapter, Basic HTTP
  authentication, 10-second timeout, payment-link initiation, Retrieve Order
  and fail-closed response validation.
- `lib/nbgReconciliation.ts` — common server-side reconciliation used by both
  the customer return and the admin check.
- `app/api/admin/nbg/create-payment-link/route.ts` — admin/MFA-protected link
  creation. The server, not the browser, supplies reservation and amount.
- `app/api/admin/nbg/check-payment/route.ts` — admin/MFA-protected manual
  reconciliation for customers who close the bank page before returning.
- `app/api/nbg/return/route.ts` — rate-limited public return that never trusts
  the redirect alone and always queries NBG.
- `app/payment/complete/page.tsx` — non-indexed customer result page.
- `supabase/migrations/20260822180000_nbg_payment_attempts.sql` — payment ledger,
  one-active-link constraint, RLS and atomic completion RPC.
- `supabase/migrations/paste/031_nbg_payment_attempts_paste.sql` — manual
  SQL-editor copy, ending with `REACHED THE END`.
- `app/admin/components/ReservationModal.tsx` — create/copy and check-payment
  controls next to the existing Stripe and Wise options.

## Environment variables

All are server-only except the pre-existing site URL. Secrets must be entered
in Vercel as encrypted values and must never be committed.

| Variable | Preview sandbox | Production |
|---|---|---|
| `NBG_PAY_ENABLED` | `true` only during controlled test | keep absent/`false` until sign-off |
| `NBG_PAY_ENVIRONMENT` | `test` | `production` |
| `NBG_PAY_MERCHANT_ID` | sandbox merchant ID from NBG | production merchant ID from NBG |
| `NBG_PAY_API_PASSWORD` | sandbox API password from NBG | production API password from NBG |
| `NEXT_PUBLIC_SITE_URL` | exact Preview URL used for returns | `https://anadyon.gr` |

The code accepts only the two official gateway origins:

- test: `https://test.ibanke-commerce.nbg.gr`
- production: `https://ibanke-commerce.nbg.gr`

There is no custom endpoint variable, preventing a configuration mistake from
sending the Basic-auth credential to another host.

## Mandatory deployment gate

Do not enable or merge this payment feature as a live payment method until all
items are complete:

- [ ] NBG has activated an Anadyon sandbox merchant and supplied the API
      password through a secure channel.
- [ ] NBG confirms PAYMENT_LINK, PURCHASE, EUR and 3-D Secure are enabled.
- [ ] PR is deployed to a Preview branch with `NBG_PAY_ENVIRONMENT=test`.
- [ ] Tasos manually runs `031_nbg_payment_attempts_paste.sql` and sees exactly
      `REACHED THE END`. Codex/CLI must never apply it automatically.
- [ ] Preview creates one bank-hosted link for one test reservation.
- [ ] A double-click/retry reuses the same active link and cannot create two
      simultaneously payable links.
- [ ] NBG test cases pass: approved, declined, cancelled, 3DS challenge,
      abandoned return and expired link.
- [ ] Approved exact EUR amount confirms the reservation once.
- [ ] Wrong order, amount, currency, non-captured status and forged browser
      return never mark a reservation paid.
- [ ] "Check NBG payment" correctly reconciles a paid order after the customer
      closes the browser before returning.
- [ ] NBG settlement report is reconciled to Anadyon payment attempts.
- [ ] Production credentials are separately added to Production; sandbox
      credentials are not copied.
- [ ] A small controlled production payment and refund are completed with NBG
      support available.
- [ ] Stripe remains enabled during the observation/rollback period.

## Key2Pay boundary

NBG's public Key2Pay material documents a bank-managed merchant portal: staff
create customers/invoices/payment requests in Key2Pay and NBG sends or presents
the payment order. It does **not** publish a supported public Key2Pay API
contract that can safely be coded against.

Official Key2Pay sources:

- service walkthrough:
  https://www.nbg.gr/en/individuals/questions/helping-videos/how-to-use-the-key2pay-service
- merchant manual:
  https://www.nbg.gr/-/jssmedia/Files/Business/Proionta-ypiresies/eisprakseis-plirwmes/key-2-pay/MANUAL-Key2Pay_Timologiou-_final.pdf

Therefore Key2Pay remains an external staff workflow unless NBG supplies a
private API specification for Anadyon's approved account. Never infer that API
from the web portal or automate the portal by scraping.

## Local verification (22 August 2026)

- TypeScript: passed with `npx tsc --noEmit`.
- Unit and database-migration tests: 232/232 passed across 33 files.
- NBG-specific tests: hosted-link payload/authentication, gateway-origin
  allow-list, exact amount/currency/captured-state validation, documented
  nested transaction shape, replay safety, amount-mismatch rollback, RLS and
  service-role-only function execution.
- ESLint: zero errors. The repository still reports 22 pre-existing React
  effect warnings; this change adds none.
- Next production compilation and TypeScript build stages passed with webpack.
  Final packaging could not be completed locally because the workstation had
  less than 1 GB free and Next exhausted the disk while writing its generated
  cache. CI/Vercel must complete the clean build before this PR can advance.
