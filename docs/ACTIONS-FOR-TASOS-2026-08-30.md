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

**What to expect afterwards — and please confirm it, because half of this is
reasoned rather than observed.**

*Observed:* the preview **builds and deploys**. Vercel reported the deployment
for this branch Ready at 18:19 on 30 August, after the placeholder was in place.
That is the half that justified placeholders over unset values.

*Also observed, 30 August:* the preview reaches no data. Tasos ran a quote on
the preview URL and got **"Price estimate unavailable"** with the fallback offer
to send the enquiry by email. `/api/quote` reads `rates` and `extras_config`
through `supabaseAdmin`, so that is the placeholder key failing to reach the
database — the intended outcome. **The exposure is closed, confirmed at the
behaviour and not only in the settings.**

Worth recording separately: the page degraded rather than broke. It still takes
the enquiry and shows the phone number, which means production stays usable if
Supabase is ever unreachable instead of presenting a broken page. That was
already built; this is the first time anything exercised it.

Redeploy a preview branch for the variables to take effect.

## 2b. Rotating the service-role key — **optional, and lower priority than first written**

*Downgraded 30 August. The first version of this item recommended rotation as
"the part that is easy to skip", which implied it mattered more than it does.
Tasos asked what had actually been exposed and why it needed changing, and the
answer did not survive the question.*

**Two risks were run together, and only one of them was real here.**

**Misuse by unreviewed code — real, and already fixed.** A preview deployment
runs whatever is on that branch, at a publicly reachable URL. A branch with a
broken `proxy.ts`, a leaking route, or an agent-written bug ran against
*production data*. Item 2 closed this, and it is the reason the work was urgent.

**Disclosure of the key itself — no evidence, and rotation is the only thing
that would help.** The plausible paths are Vercel dashboard access, build logs,
and a malicious dependency executing during a build. **All three apply to
production builds identically**, so the preview scoping never widened them and
removing it never narrows them. The key has never been in git, never in a
browser, and the only person with Vercel access is the owner.

So rotation defends against a disclosure with no sign of having happened, by a
route that scoping does not affect either way. **Recommendation: leave it.**

If you want it anyway, do it on a quiet morning, and check which mechanism your
dashboard offers first — the two differ sharply:

- **Individually revocable secret keys** — rotate that one key, update Vercel
  Production, `.env.local`, and the GitHub secret if set, redeploy. Contained.
- **JWT-secret regeneration only** — `anon` and `service_role` are both signed
  by the project JWT secret, so this changes **both**, and invalidates every
  issued JWT: everyone is signed out, you included, and the site stays broken
  until both values are updated in Vercel Production.

The second is worth weighing against
`docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`: three hours locked out of `/admin`
in August, cause never established. Deliberately invalidating your own session
is not a thing to do casually, for a benefit this thin.

---

## 2c. A staff member who forgot their password could not get back in — **fixed, needs deploying**

Found while you were trying to log in as staff for item 4. Not a problem with
the account: `app/admin/set-password/page.tsx` served both the invitation link
and the forgotten-password link, and called `updateUser({ password })` straight
away. That works for an invitation. For a reset the account already has a second
factor — `proxy.ts` makes every account enrol before it opens the admin area —
and Supabase refuses:

> AAL2 session is required to update email or password when MFA is enabled.

So **no established staff member could recover a forgotten password.** The
page's own comment explained the invitation case correctly and the reset case
was never exercised — the same shape as the turnaround applied to one end of a
rental.

Fixed on this branch: the page now asks Supabase what the session needs, and
when the answer is `aal2` it collects and verifies the code before changing the
password. An invitation reports `aal1` and goes through untouched. Seven tests,
watched failing against the old page first.

**Still missing, and deliberately not built while you were away:** nothing in
the Users screen can remove a second factor. It shows `mfaEnrolled` and offers
invite, change role, send a password link, and delete — so an account whose
*authenticator* is lost still has no route back through any UI. That needs a new
admin-only endpoint, which is a privileged capability rather than a repair, and
it is your call. Until then the service-role script is the recovery path.

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
