# Actions that need you — 30 August 2026

Everything on this list is blocked on something an agent cannot do: a Vercel
dashboard, a Supabase SQL editor, a vendor email, or a browser logged in as
staff. Ordered by urgency. Nothing here takes long except item 5, which is
mostly waiting.

---

## 1. ~~Check what Vercel gives a preview deployment~~ — **DONE, 30 August. It is what it looked like.**

All three are enabled for **Production and Preview**:

| Variable | Environments |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Production **and Preview** |
| `NEXT_PUBLIC_SUPABASE_URL` | Production **and Preview** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production and Preview, as **two separate entries** of the same name |

So every preview deployment carries the **production service-role key**, which
bypasses row-level security by design, pointed at the live database. Every
pull-request branch — unreviewed, half-finished, whatever — has had unrestricted
read and write access to a `customers` table holding passport numbers, driving
licence numbers and dates of birth.

The anon key already existing as two entries is useful news twice over: it
confirms the per-environment mechanism is set up on this project, and it means
that one needs editing rather than splitting. Item 2 says which is which.

---

## 2. Scope the Preview values to placeholders — **do this next**, under an hour

**Only one of the three actually matters, and it is the only one that worked.**
Done 30 August:

| Name | What happened |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Split and placeholdered on Preview. This closed the exposure.** |
| `NEXT_PUBLIC_SUPABASE_URL` | Not changed — blocked, see below. No security consequence. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Not changed — blocked, see below. No security consequence. |

The service-role key was the whole exposure: it bypasses row-level security by
design. The other two are not credentials in any useful sense. The URL is
already in the production site's browser bundle, and the anon key is too —
migration 019 revoked `anon`'s table grants, so it reads nothing. A preview
holding either is no more exposed than the live site is.

**Why the other two were abandoned.** Both are stored as *sensitive*, and both
carry Next.js's `NEXT_PUBLIC_` prefix, which Vercel now refuses for a sensitive
value: *"Remove the public framework prefix to keep this value private… If
that's safe, change the variable to Config."* The Config option is greyed out,
because the type belongs to the variable **name** rather than to each
per-environment value — so a Preview entry cannot diverge from the Production
entry's type. They predate the check.

Fixing it means changing the **Production** entry to Config first, which is
correct — the value is public either way — but it touches a production variable
to buy nothing. Not worth doing mid-flight. Recorded rather than done.

**The residual, which has no tripwire on it.** Previews still point at the
production project, holding an anon key that currently reads nothing. If anyone
later adds an anon-readable table or a permissive RLS policy, previews silently
regain read access to production, and no check in this repository would notice.
The real fix is the staging project; until then this is a known gap rather than
an unknown one.

**If you are redoing this from scratch**, for reference: the service-role key
needs *splitting* — open the existing entry, untick Preview, save, then add a
new Preview-only entry with value `placeholder`. Vercel rejects a second entry
for an environment the first still covers, and that rejection reads like a
permissions problem.

**Placeholders rather than nothing, deliberately.** `lib/supabase.ts` builds its
clients at module scope, so an *unset* variable fails the preview **build**, not
just its data access — `.github/workflows/ci.yml` documents exactly this and
works around it the same way. Placeholders give the identical security property
with a preview that still compiles.

**What to expect afterwards, so it does not look like a fault.** Preview
deployments will build and render, and show **no data at all** — not a subset.
Migration 019's own comment is the reason: *"everything the site serves goes
through the service role"*, so with a placeholder key every data-backed page and
route comes back empty or errors. That is the change working, not breaking.
Redeploy a preview branch for the variables to take effect.

## 2b. Then rotate the service-role key — the part that is easy to skip

Scoping closes the door. It does not ask whether anyone walked through it.

That key has been sitting in the build environment of every branch built this
month. The realistic exposure is to people who already have repository access,
so this is precautionary rather than an incident — but the correct response to a
credential that was somewhere it should not have been is to replace it, not to
move it.

**Order matters:** scope first (item 2), then rotate, then update the new value
in three places — Vercel **Production**, your local `.env.local`, and the
`SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secret if you have set one for the
schema-drift step. Rotating before scoping just puts a fresh key on every
preview.

Supabase → Project Settings → API → service_role → rotate.

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
