# Quote confirmation email delivery handoff

Updated: 23 August 2026

## Purpose

Make the **Send quote confirmation** action auditable instead of treating a successful API request as proof that the customer received the message.

The release:

- sends the quote confirmation to the customer;
- privately copies `customerservice@anadyon.gr` using BCC;
- routes customer replies to `customerservice@anadyon.gr`;
- records every send attempt before contacting Resend;
- correlates Resend webhooks using an application delivery ID;
- distinguishes queued, provider-accepted, sent, delivered, delayed, bounced, complained, failed and suppressed states;
- deduplicates webhook replays and prevents older out-of-order events from regressing a later status;
- shows the delivery history on the reservation form;
- asks for explicit confirmation before sending another quote confirmation.

## Deployment gate

Do not merge the application code before the database step. The route deliberately refuses to send when it cannot create the delivery audit row.

1. In the Supabase production project, open **SQL Editor**.
2. Run the complete contents of `supabase/migrations/paste/032_booking_email_delivery_audit_paste.sql`.
3. Confirm the final result is:

   `REACHED THE END — booking email delivery audit`

4. Merge the pull request and wait for the Production deployment to become Ready.
5. In Resend, ensure the production webhook for `/api/resend-webhook` subscribes to:

   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.suppressed`

6. From a controlled real reservation, send one quote confirmation to a monitored customer inbox.
7. Confirm:

   - the customer receives the message;
   - `customerservice@anadyon.gr` receives the private copy;
   - replying addresses the response to `customerservice@anadyon.gr`;
   - the reservation initially shows **Accepted by email provider** or **Sent by email provider**;
   - after Refresh, it shows **Delivered to recipient's mail server**;
   - the deadline and recipient are correct.

If the email arrives but the status remains **Accepted by email provider**, check the Resend webhook event subscriptions before changing application code.

## Safety properties

- Both new tables have row-level security enabled.
- `public`, `anon` and `authenticated` have no table access or function execution.
- Only `service_role` can use the audit tables and event-recording function.
- Preview mail redirection removes all CC/BCC recipients, preventing a Preview test from copying real addresses.
- Resend idempotency keys are stable across queued retries.
- Webhook processing returns an error when audit persistence fails, allowing Resend to retry.

## Verification completed before release

- Full unit and migration suite: 259 tests passed.
- Focused migration test passed against both the numbered migration and exact SQL Editor paste copy.
- TypeScript: passed.
- ESLint: zero errors (pre-existing warnings remain elsewhere in the project).
- Production build: passed with non-secret placeholder environment values.
- Dependency audit: zero known vulnerabilities.
- Migration and paste copy are byte-identical and below the known SQL Editor paste-size risk.

## Files

- `app/api/admin/reservations/[id]/quote-confirmation/route.ts`
- `app/api/resend-webhook/route.ts`
- `app/admin/components/ReservationModal.tsx`
- `lib/bookingEmails.ts`
- `lib/mailer.ts`
- `supabase/migrations/20260823130603_booking_email_delivery_audit.sql`
- `supabase/migrations/paste/032_booking_email_delivery_audit_paste.sql`
