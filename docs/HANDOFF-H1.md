# Handoff — H1, atomic booking creation

Written 20 August 2026. For whoever implements this next, and for me when I
pick it back up. Everything below was verified against production on the date
above rather than read off the repository.

---

## 1. Where things stand

Migrations **021, 022 and 023 are applied.** Verified:

- `release_promo` is callable by `service_role`.
- `quotes.idempotency_key` and its partial unique index exist.
- `assert_least_privilege()` returns **zero rows** — the 179 residual grants to
  `anon` and `authenticated` are gone, and the public site still serves its
  rate card (36 `pricing_group` entries in the payload for `/cars`).

**`create_web_booking` exists but does not work.** Fix this first; the rest of
the task is pointless until it does.

## 2. The blocker

```sql
insert into quotes select * from jsonb_populate_record(null::quotes, p_quote)
```

`jsonb_populate_record` against a `null` record produces a row where every
column the caller did not supply is NULL — and `select *` then inserts those
NULLs *explicitly*, so column defaults never fire. Confirmed against
production:

| Call | Result |
|---|---|
| `p_quote: {}` | `23502 null value in column "id"` |
| `p_quote: {id}` | `23502 null value in column "ref"` |
| `p_quote: {id, ref, created_at}` | fails on `reservations.id` — same cause |

Two useful facts from the same probes: unknown keys in the jsonb are silently
ignored, and the function is one transaction, so a failure in the reservation
insert rolls the quote insert back. Nothing was written by any of the above.

**Fix — insert only the columns actually supplied**, so every default applies:

```sql
declare
  v_cols text;
begin
  select string_agg(quote_ident(k), ', ')
    into v_cols
    from jsonb_object_keys(p_quote) k
   where k in (select column_name
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'quotes');

  execute format(
    'insert into quotes (%s) select %s from jsonb_populate_record(null::quotes, $1) returning id',
    v_cols, v_cols
  ) into v_quote_id using p_quote;
```

and the same shape for `reservations`. Prefer this over merging in `id` and
`created_at` by hand — a hand-written default list silently rots the next time
a column with a default is added.

## 3. The design decision, and why

The route redeems the promo **before** it builds the rows, because the discount
feeds `finalTotal`, which is written into the quote row, the reservation row
and the customer's email. `create_web_booking` redeems the promo **inside** its
transaction and computes its own discount. Wire the two together naively and
the same number has two sources of truth.

**Agreed approach (option B): the database is the single source.** The route
sends the pre-discount total; the function redeems, computes the discount, and
overrides the money fields in both jsonb payloads before inserting.

Add to the signature:

```sql
p_deposit_rate numeric default 0.30   -- DEPOSIT_RATE in lib/pricing.ts
```

After `v_discount` is computed, and before the inserts:

```sql
v_final_total   := greatest((p_quote->>'total')::numeric - v_discount, 0);
v_final_deposit := round(v_final_total * p_deposit_rate, 2);

p_quote := p_quote || jsonb_build_object(
  'total', v_final_total,
  'deposit', v_final_deposit,
  'balance_due', v_final_total - v_final_deposit,
  'discount_amount', v_discount
);
p_reservation := p_reservation || jsonb_build_object(
  'total', v_final_total,
  'deposit', v_final_deposit,
  'balance_due', v_final_total - v_final_deposit,
  'discount_amount', v_discount,
  'promo_code_id', v_promo_id
);
```

Return `discount`, `total`, `deposit` and `balance_due` so the route uses the
stored figures in its emails rather than recomputing them.

## 4. Route changes — `app/api/quote/route.ts`

1. **Remove the standalone `redeem_promo` call** (~line 239) and the
   `finalTotal` / `finalDeposit` / `finalBalanceDue` arithmetic that follows it.
   Pass `total` (pre-discount) in the quote payload and let the function settle
   the rest.
2. **Replace the two separate inserts** (~lines 286 and 355) with one
   `create_web_booking` call. Delete the compensation block at ~line 331 — with
   one transaction there is nothing left to compensate.
3. **Generate a stable idempotency key.** It must be identical across a retry
   of the *same* submission and different for a genuinely new one. Derive it
   from the submitted content — customer email, dates, vehicle, total — not
   from `randomUUID()`, which changes on every retry and defeats the point.
4. **Handle `idempotent_replay: true`.** Return the original `ref` and **do not
   send either email again.** A customer who retries after a timeout must not
   receive a second confirmation. This is the single easiest thing to get wrong
   here.
5. Use the returned `total` / `deposit` / `balance_due` in both emails.

Columns currently written, for reference:

- **quotes** — `first_name last_name postal_code mobile_tel landline_tel
  vehicle_type selected_model pricing_group pickup_location dropoff_location
  pickup_date pickup_time dropoff_date dropoff_time driver_age transmission
  baby_seat child_seat fdw additional_drivers rental_days daily_rate
  vehicle_subtotal extras_subtotal total deposit balance_due promo_code
  discount_amount comments expires_at`
- **reservations** — `vehicle_id customer_name customer_email customer_phone
  pickup_date pickup_time return_date return_time pickup_location
  dropoff_location rental_days daily_rate vehicle_subtotal extras_subtotal
  baby_seat child_seat fdw additional_drivers total deposit balance_due
  promo_code_id discount_amount discount_reason status source notes`

## 5. Tests to add

In `lib/`, following the existing pattern (mock `@/lib/supabase`):

- A failed booking returns 5xx and sends **no** email.
- A replay returns the original `ref` and sends **no** email.
- The stored total equals server total minus the discount the function applied
  — not the client's figure.
- An exhausted promo code still books, at full price.

## 6. Verifying it

There is no staging database. A real booking creates real rows.

1. Set `MAIL_REDIRECT_TO` so no customer receives anything.
2. Submit one booking through the live form.
3. Check `quotes` and `reservations` each gained exactly one row, with matching
   `total`, and that `promo_codes.used_count` moved by exactly one if a code
   was used.
4. Submit the identical form again — confirm the same `ref` comes back, no new
   rows, and no second email.
5. **Delete the test rows** (`quotes` and `reservations` by `ref`), and unset
   `MAIL_REDIRECT_TO`.

## 7. Standing constraints

These are not negotiable and are not obvious from the code:

- **Never commit `.env.local`.** It holds live secrets.
- **The server's pricing always wins.** The client displays a figure;
  `/api/quote` recalculates from database rates and its numbers are what get
  stored and emailed. Never trust a client-supplied amount.
- **Never grant table access `TO anon`.** RLS filters rows, not columns —
  see migration 019 and `project_rls_pii_leak`.
- **Card numbers are never stored.** Stripe reference, brand and last4 only.
- **Always `git push`.** Vercel builds from the GitHub remote; a CLI-only
  deploy gets overwritten by the next git build with stale code.
- **Probe RPCs with their real arguments.** `db.rpc(fn, {})` on a function with
  required parameters returns `PGRST202 could not find … without parameters`,
  which reads exactly like the function being absent. It produced a false
  "ABSENT" on functions that were present.

## 8. For a clean handback

- **Work on a branch, not `main`.** Vercel deploys `main` on every push, and
  this is the booking path. Open a PR and leave it unmerged.
- Keep commits small, one concern each, with the reasoning in the message
  rather than only the change.
- If a migration turns out to be needed, write it as a numbered file in
  `supabase/migrations/` and a stripped copy in `supabase/migrations/paste/`.
  **Do not apply it** — Tasos runs those by hand through the SQL editor, which
  silently truncates pastes over roughly 6.5 KB. Wrap in `begin/commit` and end
  with `select 'REACHED THE END'`.
- Before handing back, leave a short status note at the bottom of this file:
  what was done, what was not, and anything that surprised you.

## 9. Everything still open after this

- **M1** — the admin auth fast path. Deliberately untouched: get it subtly
  wrong and Tasos is locked out of his own admin.
- **M8** — Gmail refresh tokens are plaintext in `system_settings`. Needs a key
  held outside the database, so it is a new secret and his decision.
- **M10 / L2** — Vercel Firewall, and `anadyon-eight.vercel.app` still serving
  the site directly. Both in his dashboard.
- **H4** — branch protection, Dependabot, CodeQL. Repository settings. The
  actions are already SHA-pinned.
- **M5** — confirm whether leaked-password protection is a switch or a
  paid-plan feature before treating it as a task.
- **A restore has still never been performed.** See `docs/RESTORE.md`.

---

## Status log

*Append here. Newest last.*

- **2026-08-20, Claude.** Applied and verified 021/022/023. Found
  `create_web_booking` non-functional (section 2). Did not start the route
  change — handed off at this point.
