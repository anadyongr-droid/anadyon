# Actions that need you — 30 August 2026

Everything on this list is blocked on something an agent cannot do: a Vercel
dashboard, a Supabase SQL editor, a vendor email, or a browser logged in as
staff. Ordered by urgency. Nothing here takes long except item 5, which is
mostly waiting.

---

## 1. Check what Vercel actually gives a preview deployment — 2 minutes, do this first

**Vercel → your project → Settings → Environment Variables.** Look at
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and note which environments each is ticked for.

**Why:** `docs/ARCHITECTURE-STATUS-2026-08-30.md` §6.1 says preview deployments
run with production credentials. That is **inferred, not verified** — inferred
from Vercel applying a variable to every environment unless scoped, and from
`docs/PREVIEW-RECAPTCHA-TEST-KEYS.md` recording its own preview variables as
*"not yet set"*. If the inference is right, every pull-request branch — including
unreviewed and half-finished ones — has unrestricted write access to a
`customers` table holding passport numbers, licence numbers and dates of birth,
because the service role bypasses row-level security by design.

**Tell me which it is.** If they are already scoped to Production, the exposure
does not exist and the staging work drops down the priority list. If they are
not, item 2 closes it today rather than at the end of a two-day build.

---

## 2. If item 1 shows they are unscoped: add Preview-scoped placeholders — under an hour

Not "remove the variables". **Add a second, Preview-scoped value** for each —
Vercel allows the same name to hold different values per environment, which is
the same mechanism `PREVIEW-RECAPTCHA-TEST-KEYS.md` describes.

| Name | Preview value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://placeholder.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `placeholder-anon-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `placeholder` |

**Placeholders rather than nothing, deliberately.** `lib/supabase.ts` builds its
clients at module scope, so an *unset* variable fails the preview **build**, not
just its data access — `.github/workflows/ci.yml` documents exactly this and
works around it the same way. Placeholders give the identical security property
with a preview that still compiles and serves its static pages.

**What this costs:** previews stop being able to show real data until staging
exists. Given that "real data" here means production, that is the point.

---

## 3. Apply migration 039 — **before** the current branch is merged

`supabase/migrations/paste/039_vehicle_open_damage_view_paste.sql`, into the
Supabase SQL editor. It creates the `vehicle_open_damage` view.

**Ordering matters here in a way it usually does not.**
`app/api/admin/vehicles/damages/route.ts` now queries that view. If the code
reaches production before the view exists, the fleet screen's damage column
breaks. Apply the migration first, confirm, then merge.

You should see `REACHED THE END — vehicle open damage view`. To confirm:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'vehicle_open_damage'
order by column_name;
```

Four rows — `description`, `reported_on`, `severity`, `vehicle_id` — and
crucially **no `repair_cost`**. That absence is the whole point of the change:
the column list in the endpoint was the only thing holding repair costs back
from a staff session, and a view that does not contain the column cannot leak it
however the query is later refactored.

---

## 4. Run the two RPC diagnostics — 10 minutes, and they unblock the biggest thing

`docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` §10 has both, ready to paste, with
what each answer means.

- **§10a** is a browser-console snippet. Log into `/admin` **as a normal staff
  member**, open the console on any admin page, paste it. It prints key names
  and value types only — no token or claim value is ever printed, deliberately,
  because an access token is a bearer credential.
- **§10b** is four read-only catalogue queries for the Supabase SQL editor. They
  write nothing and are safe to re-run.

**Why this one matters most:** it is the last thing standing between here and
phase 2 — check-out / check-in — which is what unlocks contracts, fuel and
mileage charges, damage evidence and the maintenance feed. Every migration
written since has had to record staff identity as *the application's claim about
who acted* rather than as something the database can verify. Paste the output
back and the design question closes.

---

## 5. Start the Record360 evaluation — two elapsed days, mostly waiting

Decided on 26 August, then parked inside Gate 0. Outside review on 30 August
found that coupling wrong and it is now decoupled: nothing the legal audit
produces changes *what you ask the vendor*, only what you do with the answers.
Meanwhile every week of counter code makes reopening the build-or-buy decision
more expensive.

Send these five, and ask for written answers:

1. Pricing for **29 mixed assets** — cars, scooters and bicycles.
2. **DPA, data location and retention terms** (EU/GDPR).
3. **Complete media export terms** — every photograph, in bulk, on exit.
4. **API and webhook access terms**, and which tier they require.
5. **Proof that cars, scooters and bicycles can carry *different* inspection
   templates.**

If any answer is unavailable, or an iPad and Android trial does not succeed, the
decision stands and phase 2 builds native capture. The evaluation does not
reopen the decision to build the counter here, and must not delay phase 1.

**Also decide, and it needs a name and a date, not an answer today:** who
produces the three-year native-build-against-capture-vendor cost estimate. A
reopening gate with no number behind it never trips.

---

## 6. Run the drift check, both ways — 1 minute, after item 3

```
npm run check:schema
```

It compares in **both** directions as of today. The reverse half is new and
exists because of `customers.name`: a legacy column production has carried since
before the migration files existed, that no migration declares, and that no
check in this repository could ever have found. A replay into an empty database
tripped over it by accident.

Expect: `customers.name` listed once as **excused, with a reason**, and
everything else clean. Anything else in the "deployed database has that no
migration declares" list is a new finding — send it to me. Nothing would be
broken today, but it would mean a rebuilt or restored database silently differs
from production, which is exactly what makes a staging environment lie.

---

## What is already done and needs nothing from you

- The view migration, the endpoint change and their tests — written, tested,
  pushed. Only the apply in item 3 is outstanding.
- The bidirectional drift check — written and unit-tested. It cannot be run from
  the build container, which holds no credentials; item 6 is that run.
- The migration-replay repair — decided and recorded
  (`docs/RENTAL-SYSTEM-BLUEPRINT.md` §10, 30 August). **Codex implements it**;
  it is on `codex/test-environment-foundation`, PR #66.
- Error tracking, staging and e2e-in-CI — Codex's, per
  `docs/HANDOVER-TEST-ENVIRONMENT.md`.
