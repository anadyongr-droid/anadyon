# Open question: how does a database function know *which* staff member is calling?

**Status: Option A adopted, 31 August 2026. One vendor behaviour left to
confirm, and it fails closed.** Written 28 August 2026 for outside review; §§11–13
record what the diagnostics found and §13 the decision taken on them. Read §13
first if you only want the answer. Nothing here is implemented yet, and
`RENTAL-SYSTEM-BLUEPRINT.md` §4.2's OPEN block is narrowed rather than deleted —
see §13.4 for exactly what a builder may and may not now do.

This is written to be read cold. It assumes no knowledge of the project.

---

## 1. The system, in one paragraph

Anadyon is a vehicle rental system for a 29-vehicle operator in Greece: a
Next.js application on Vercel, with Supabase (hosted Postgres, plus its auth
service and its PostgREST-style "Data API") as the only datastore. Staff sign in
to an admin area; the public site takes booking enquiries. There is no separate
backend service — the Next.js route handlers *are* the server.

The next phase of work adds a counter workflow: vehicle handover to a customer,
condition photographs, damage observations, and charges raised from them. That
work has to be defensible months later in a dispute, so **who did what** is not
decoration.

## 2. The design that is blocked

Phase 2 finalises a handover through a Postgres function rather than a series of
application writes, so that the whole thing commits or none of it does. The
security design for that function, as currently written, is:

> - a **thin gateway function in `public`**, which is what the server route calls;
> - it verifies `auth.uid()` against database-held staff membership — never a JWT
>   claim — then calls the real implementation in a private schema;
> - `SECURITY DEFINER` only where required, always with `SET search_path = ''`;
> - `EXECUTE` revoked from `PUBLIC` and `anon`.

`auth.uid()` is Supabase's helper for "the authenticated user making this
request". It reads the `sub` claim of the JWT that the Data API received.

## 3. Why it cannot work as written

**Every non-test call into a database function in this codebase is made with the
service-role key.** There are nine:

| Call site | Function |
|---|---|
| `app/api/admin/reservations/[id]/route.ts` | `promo_release` |
| `app/api/admin/reservations/[id]/quote-confirmation/route.ts` | `promo_hold` |
| `app/api/admin/invoices/submit/route.ts` | `claim_invoice_submission` |
| `app/api/admin/invoices/submit/route.ts` | `next_invoice_aa` |
| `app/api/admin/aade/submit/route.ts` | `claim_dcl_submission` |
| `app/api/quote/route.ts` | `create_web_booking` |
| `app/api/resend-webhook/route.ts` | `record_booking_email_event` |
| `lib/confirmPaidBooking.ts` | `promo_redeem` |
| `lib/rateLimit.ts` | `check_rate_limit` |

All of them go through `supabaseAdmin`, which is:

```ts
// lib/supabase.ts
export const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

A service-role JWT authenticates the *application*, not a person. It carries no
end-user `sub`. **`auth.uid()` therefore returns NULL inside any function called
this way.**

So the gateway as specified has two possible outcomes, and both are bad:

1. Written strictly, it rejects every call — the feature does not work at all.
2. Written permissively enough to work (`auth.uid() IS NULL OR <member check>`,
   or a NULL-tolerant join), it **looks like an identity check and is not**. It
   would pass review, pass tests, and record no meaningful actor.

Outcome 2 is the one to worry about, because it is what a developer under time
pressure produces when the strict version returns "access denied" on every
attempt.

There is no escape hatch: `package.json` contains no Postgres driver (`pg`,
`postgres.js`, Prisma, Drizzle — none). The Data API is the only route to the
database, so "just connect directly as the staff user" is not available.

**Note that this is the second iteration of the same mistake.** The previous
version of this section specified the finalisation functions in a *private,
non-exposed schema*. That was corrected after someone checked how the
application actually calls the database: the Data API only exposes configured
schemas, so the function would have been unreachable. The correction introduced
the `auth.uid()` gateway — without checking the same thing. We would rather not
guess a third time, which is why this is an open question and not a patch.

## 4. What is already true, and is useful

The staff user's identity **is** available in an admin request. It simply never
reaches the database.

- `proxy.ts` (Next.js middleware) builds a cookie-backed client with
  `createServerClient` from `@supabase/ssr`, calls `supabase.auth.getUser()`,
  resolves the person's role, and forwards it downstream as an
  `x-anadyon-role` header — after deleting any inbound copy of that header, so
  it cannot be spoofed. Auth calls time out at 8 seconds and fail closed.
- Roles live in Supabase `app_metadata`, which the account holder cannot edit
  (as opposed to `user_metadata`, which they can).
- **There is already a precedent for a route holding the staff user's own
  session**: `app/api/admin/users/route.ts` constructs a cookie-backed
  `createServerClient` and calls `auth.getUser()` to identify the caller. It
  just doesn't use that client for anything else.

So the identity exists on the request. The question is how — and whether — to
carry it into the database.

## 5. A constraint that shapes the answer

Not every privileged call has a staff user behind it. Of the nine above:

- **Staff-initiated**, in a browser request with a session: the reservation,
  invoice and AADE routes. Handover finalisation will join these.
- **System-initiated**, with no user and no session: `create_web_booking` (a
  member of the public submitting the form), `record_booking_email_event` (an
  inbound webhook from the email provider), `check_rate_limit`,
  `promo_redeem` (runs from payment confirmation).

Any answer has to keep working for the second group. "Always use the user's
JWT" is not available as a blanket rule.

## 6. The options as we see them

### Option A — call staff-initiated RPCs with a user-scoped client

Construct a per-request client from the session cookies (the
`app/api/admin/users/route.ts` pattern) and call `.rpc()` on *that* instead of
`supabaseAdmin`. The staff member's JWT reaches the Data API, `auth.uid()`
resolves, and the gateway works as designed.

- **For:** the database becomes a real authorisation boundary rather than a
  trusting one. It is the mechanism Supabase's model is built around. The
  precedent already exists in the repository.
- **Against:** those calls now execute as the `authenticated` role, so RLS
  applies to every table the function touches and each needs correct policies
  and grants — meaningful work, and a migration that is easy to get subtly
  wrong. Requires the two call groups in §5 to be separated explicitly.
  `SECURITY DEFINER` still has to do the privileged part, so the gateway's job
  becomes narrow but real.

### Option B — keep the service role, pass the actor as an argument

Keep `supabaseAdmin`, add `p_actor_id uuid` to each function, and have the
route pass the id it already resolved from the session.

- **For:** small, obvious, no RLS work, no change to how any existing call is
  made. The audit trail gets a real actor immediately.
- **Against:** the database is trusting the application's word about who is
  acting, which is exactly what `auth.uid()` exists to avoid. Anyone holding the
  service-role key can claim to be anyone. Whether that matters depends entirely
  on question 3 below.

### Option C — pass the user's JWT and verify it inside the function

Forward the access token as a parameter or a set-local setting and validate it
in SQL.

- **For:** keeps one client, gets a verified identity.
- **Against:** hand-rolled token verification in the database, which is a
  well-known way to be wrong quietly. We are inclined to reject this unless a
  reviewer sees something we don't.

## 7. What we would like an outside opinion on

1. **Is Option A the correct default for a Supabase project of this shape**, or
   is running privileged, transactional, multi-table writes through the
   `authenticated` role a practice that causes more problems than it solves at
   this scale?
2. **If Option A: how should the two call groups be separated** so that a
   future contributor cannot accidentally call a staff-only function with the
   service role and have it silently succeed? Is that enforceable in the
   database rather than by convention?
3. **Is Option B defensible here?** The realistic threat is a careless or
   malicious *staff member*, not an attacker holding the service-role key —
   if the key is out, far more is lost than the audit trail. Does that make
   application-asserted identity adequate for a 29-vehicle operator, or is it
   the kind of shortcut that is very expensive to reverse once handover records
   depend on it?
4. **Is there a fourth option** we have not considered, given the constraint
   that the Supabase Data API is the only path to the database?
5. **Is `SECURITY DEFINER` with `SET search_path = ''` still the right envelope**
   for the privileged half under whichever option is chosen?

## 8. What we are *not* asking

Whether to build the counter at all — that is decided and the reasoning is in
`RENTAL-SYSTEM-BLUEPRINT.md` §1.8 and §7. Whether Supabase was the right
platform — it is what exists, on a free tier, and migrating is not on the table.
And anything about the quote-reference generator, which is a separate defect
tracked separately.

## 9. Files a reviewer would want open

| Path | Why |
|---|---|
| `lib/supabase.ts` | The two clients, and only those two |
| `proxy.ts` | Where auth is resolved and the role header is set and stripped |
| `app/api/admin/users/route.ts` | The existing cookie-backed user-client pattern |
| `app/api/admin/invoices/submit/route.ts` | A representative staff-initiated RPC |
| `app/api/quote/route.ts` | A representative system-initiated RPC |
| `supabase/migrations/023_least_privilege_grants.sql` | How grants are currently written |
| `docs/RENTAL-SYSTEM-BLUEPRINT.md` §4.2 | The blocked design, with this question marked OPEN |

---

## 10. How to run the two diagnostics — 30 August 2026

Both of these were blocking a decision, and neither needs a migration. Nothing
here writes to the database.

### 10a. The JWT payload — what claims a staff session actually carries

This decides whether Option A can read the role from the token, or whether the
role has to keep coming from `proxy.ts`.

**Do not paste a raw access token into a chat, an issue, or a document.** It is
a bearer credential and it is valid until it expires — anyone holding it is that
staff member. The snippet below never prints one: it walks the decoded payload
and prints **key names and value types only**, which is the entire question.

Log in to the admin site as a normal staff member, open the browser console on
any `/admin` page, and run:

```js
(() => {
  // @supabase/ssr stores the session in cookies, chunked when large.
  const raw = document.cookie.split("; ")
    .filter(c => /^sb-.*-auth-token(\.\d+)?=/.test(c))
    .sort()                                   // .0, .1, … reassemble in order
    .map(c => c.slice(c.indexOf("=") + 1))
    .join("");
  if (!raw) return "No Supabase auth cookie here — logged in on this domain?";

  let v = decodeURIComponent(raw);
  if (v.startsWith("base64-")) v = atob(v.slice(7));
  const token = JSON.parse(v).access_token;

  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));

  // Shape only. No values leave this function.
  const shape = (o, prefix = "") => Object.entries(o).flatMap(([k, val]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return val && typeof val === "object" && !Array.isArray(val)
      ? shape(val, path)
      : [`${path}  <${Array.isArray(val) ? "array" : typeof val}>`];
  });
  return shape(payload).sort().join("\n");
})()
```

What to look for in the output, and what each answer means:

| Key present | What it settles |
|---|---|
| `sub` | Always there. This is exactly what `auth.uid()` returns — the two are the same value by definition, so no separate test of `auth.uid()` is needed. |
| `app_metadata.role` (or similar) | The role is **in the token**. Option A can authorise in SQL from the JWT, and `proxy.ts` stops being the only place that knows. |
| `role` | This is the *Postgres* role (`authenticated`), not the Anadyon one. Easy to confuse with the row above; they are unrelated. |
| no role claim anywhere | Option A still works for identity, but the role must keep coming from `proxy.ts`, and §7 question 2 gets harder. |

### 10b. What Option A would actually cost

§6 says Option A needs "correct policies and grants" on every table the
functions touch, and calls that "meaningful work". That is a guess. These four
queries turn it into a count. All are read-only catalogue queries — safe to run
in the Supabase SQL editor, and safe to re-run.

```sql
-- 1. Every SECURITY DEFINER function, and whether its search_path is pinned.
--    A blank search_path is the CVE-2018-1058 envelope; anything else is a
--    finding in its own right.
select p.proname,
       p.prosecdef                                    as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(none)') as settings,
       pg_get_function_identity_arguments(p.oid)      as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;

-- 2. RLS state per table. Under Option A these calls run as `authenticated`,
--    so every table with rls_enabled = false and no policies is a table that
--    would become readable or writable by any logged-in staff member.
select c.relname                                                as table_name,
       c.relrowsecurity                                          as rls_enabled,
       c.relforcerowsecurity                                     as rls_forced,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- 3. What `authenticated` can already do without any policy work.
select table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
group by table_name
order by table_name;

-- 4. Which tables each SECURITY DEFINER function names in its body.
--    A text match, so it over-reports (a table named in a comment counts) —
--    it is a worklist to check, not an answer.
select p.proname as function_name, t.relname as touches_table
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral (
  select c.relname
  from pg_class c
  join pg_namespace cn on cn.oid = c.relnamespace
  where cn.nspname = 'public' and c.relkind = 'r'
    and p.prosrc ~* ('\m' || c.relname || '\M')
) t
where n.nspname = 'public' and p.prosecdef
order by 1, 2;
```

**How to read the result.** Query 2 is the one that decides. Count the tables
that query 4 lists against the staff-initiated functions (§5), then look up each
in query 2. Every one showing `rls_enabled = false` is a table needing a policy
before Option A is safe — because the moment those calls stop using the service
role, the only thing standing between a logged-in staff member and the raw table
is a policy that does not exist yet. That count *is* the cost of Option A, and
it is the number §7 question 1 is really asking about.

If it comes back small, Option A is the straightforward answer. If it is most
of the schema, question 3 — is Option B defensible for a 29-vehicle operator —
stops being a shortcut and becomes a proportionate reading of the threat.

**What is already settled and does not need re-testing.** Run against PGlite on
26 August, recorded here so nobody spends an evening on it twice: `auth.uid()`
returns NULL with no claims set; the guard clause raises as intended;
`SECURITY DEFINER` does bypass RLS; and `SET request.jwt.claims` will forge a
`sub` and defeat the guard — which is precisely why "the application asserts who
is acting" (Option B) is a trust decision and not a technical one.

---

## 11. Result of diagnostic 10a — 30 August 2026

Run by Tasos against production, in a **staff** session (obtained after the
`set-password` MFA fix shipped, which is what had made a staff login
unavailable). Key names and types only, as the snippet prints:

```
aal  <string>                      is_anonymous  <boolean>
amr  <array>                       iss  <string>
app_metadata.provider  <string>    phone  <string>
app_metadata.providers  <array>    role  <string>
app_metadata.role  <string>        session_id  <string>
aud  <string>                      sub  <string>
email  <string>                    user_metadata.email_verified  <boolean>
exp  <number>
iat  <number>
```

### What this settles

**`sub` is present, so Option A works.** Under a user-scoped client the staff
member's JWT reaches the Data API and `auth.uid()` resolves to this value. The
gateway design in §2 is buildable as written. That was the question.

**`app_metadata.role` is present**, so the role travels in the token and
`proxy.ts` is no longer the only place that knows it. §10's table anticipated
this.

**`aal` is present, which §10's table did not anticipate and is worth having.**
The assurance level is a claim, so a function can require `aal2` for a specific
operation rather than trusting that middleware checked. For the counter that is
a real option: releasing a damage block, or voiding a charge, could demand a
second factor *at the database*, not merely at the screen.

### What it does not settle, and one tension to resolve

**The cost of Option A is still unmeasured.** §10b — RLS state, existing
`authenticated` grants, and the `SECURITY DEFINER` inventory — has not been run.
Option A's "against" is entirely about that work, so the decision is not ready.

**And §10's table overstates one thing.** It reads *"the role is in the token.
Option A can authorise in SQL from the JWT"* — but §2's design says the gateway
*"verifies `auth.uid()` against database-held staff membership — **never** a JWT
claim"*. Both cannot stand, and §2 is right. A claim is minted at sign-in and
stays valid until the token expires, so a staff member whose access is revoked
keeps a `role` claim saying otherwise for the life of their session. Availability
is not authority.

**The resolution, unless review disagrees:** use `sub` for identity, verify role
and membership against the database, and treat `app_metadata.role` as a cheap
pre-filter that can only ever *narrow* what the database then confirms — never
as the thing that grants. `aal` is the exception worth arguing about: it
describes how the *current session* was authenticated rather than what the
account is entitled to, and it cannot be stale in the same way.

---

## 12. Result of diagnostic 10b — 30 August 2026

All four queries run against production by Tasos. **The costing in §6 was too
pessimistic, and in an instructive direction: it feared a fail-open risk that
does not exist, and it sized the work against the wrong set of functions.**

### 12.1 RLS is on everywhere; `authenticated` has almost nothing

All **22** tables have `rls_enabled = true`. Not one is false, so the failure
§10b was written to look for — *"every table with rls_enabled = false and no
policies is a table that would become readable or writable by any logged-in
staff member"* — **has zero instances**.

Policies exist on three tables only (`extras_config`, `quotes`, `rates`, one
each). Grants to `authenticated` exist on two, read-only:

| table | privileges to `authenticated` |
|---|---|
| `extras_config` | SELECT |
| `rates` | SELECT |

RLS enabled with no policy denies everything to a role that is neither owner nor
`BYPASSRLS`. So today the database is **deny-by-default for `authenticated`**,
and the application works solely because every call goes through the service
role. That is a coherent posture rather than an accident, and it is the reason
migrations 014 and 023 exist.

### 12.2 The failure direction is inverted from what §6 assumed

§6's case against Option A reads *"each needs correct policies and grants —
meaningful work, and a migration that is easy to get subtly wrong."*

The work is real. The **danger** is not. Getting a policy wrong under Option A
means a staff call is **refused** — immediately, visibly, in testing. It cannot
mean a table quietly becomes readable, because the starting position is deny.
Fail-closed and fail-open are not the same risk wearing different clothes, and
"easy to get subtly wrong" was the wrong phrase: it is easy to get *obviously*
wrong, which is the kind you want.

This is the strongest argument yet for Option A over Option B, and it is the
opposite of what this document expected the diagnostics to show.

### 12.3 The staff-initiated group is currently **one function**

§5 says any answer must keep working for calls with no user behind them, and
that the two groups must be separated. Query 4 makes the split concrete — and
the staff side is far smaller than "the reservation, invoice and AADE routes"
implied:

| group | functions |
|---|---|
| **Staff-initiated** | `apply_vehicle_change_request` — and nothing else today |
| **Public / website** | `create_web_booking`, `find_available_eligible_vehicle`, `assign_eligible_vehicle_to_web_reservation`, `book_vehicle`, `redeem_promo`, `promo_hold`, `promo_redeem`, `promo_release`, `promo_uses_remaining`, `release_promo` |
| **System / cron / webhook** | `promo_release_expired`, `record_booking_email_event`, `claim_dcl_submission`, `claim_invoice_submission`, `next_invoice_aa` |
| **Triggers, never called directly** | `sync_customer_identity_from_customer`, `sync_customer_identity_from_reservation`, `sync_web_quote_customer_dob`, `customers_sync_legacy_name`, `set_updated_at` |
| **Meta** | `assert_least_privilege` |

`apply_vehicle_change_request` touches two tables: `vehicle_change_requests` and
`vehicles`. **That is the whole of Option A's surface today** — one function, two
tables — not twenty functions and twenty-two tables. Phase 2's handover
finalisation joins this group, which is exactly where identity matters and
exactly why the question was asked.

### 12.4 The consequence §6 missed, and the one thing left to confirm

**Option A probably needs no RLS policies at all.** The gateway is reached as
`authenticated`, but the work still happens in a `SECURITY DEFINER` function,
which executes as its owner and therefore bypasses RLS on the tables it touches.
What changes hands is *identity*, not *privilege*. So the cost reduces to:

1. `GRANT EXECUTE` on the gateway to `authenticated` — currently revoked, by
   migrations 014 and 023, deliberately;
2. the gateway verifying membership against the database, per §2;
3. the §5 separation, which query 4 above now supplies as a list.

**This rests on one assumption that has not been tested and must be before any
of it is built:** that `auth.uid()` resolves inside a `SECURITY DEFINER`
function when the call arrives from a user-scoped client. It should — PostgREST
sets the JWT claims per request and `auth.uid()` reads them, independently of
which role the function body executes as — but "should" is what this whole
document exists to stop relying on.

**Diagnostic 10c, to be run before anything is built:**

```sql
create or replace function public.whoami_probe()
returns table (uid uuid, jwt_role text, pg_role text)
language sql
security definer
set search_path = ''
as $$ select auth.uid(),
             current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
             current_user::text $$;

grant execute on function public.whoami_probe() to authenticated;
```

### The short way — a script, no browser

Sign in with a password and you get a JWT carrying `sub` at `aal1`; MFA raises
the assurance level, it does not add the subject. A JWT reaching PostgREST is
the whole mechanism under test, so no browser, no cookies and no authenticator
are needed:

```
PROBE_EMAIL=you@example.com PROBE_PASSWORD='…' npm run probe:rpc-identity
```

**It calls the function twice, and the control is the point.** Once with the
user's token, once with the service role. The service-role call is expected to
return a NULL `uid` — that is the defect this document is about. Both null means
something else is wrong and neither result should be believed; both non-null
means the probe is not measuring what it claims. Only `uid` under the user and
NULL under the service role proves anything.

The password is read from the environment and written nowhere.

### The long way — the route, in a browser

Kept because it exercises the real production path: a cookie-backed
`createServerClient`, which is what the application would actually use. The
script proves the mechanism; this proves the mechanism *as the app builds it*.
If the script answers cleanly, this is optional.

Signed in to `/admin` **as an administrator**, open:

```
/api/admin/diagnostics/rpc-identity
```

That route is built for this and nothing else. It constructs a per-request
client from the session cookies — the Option A pattern, borrowed from
`app/api/admin/users/route.ts` — and calls the probe through it, **not** through
`supabaseAdmin`. `lib/rpcIdentityProbe.test.ts` asserts it never reaches for the
service role, because swapping the client would leave the route returning 200
and proving nothing.

**An administrator session is enough**, and the earlier draft of this section
was wrong to ask for staff. What is under test is whether JWT claims reach the
function at all, which does not depend on which role the claim carries. Running
it as staff would mean adding a throwaway diagnostic to `proxy.ts`'s `STAFF_API`
allowlist, and allowlist entries added "temporarily" are how allowlists grow.

**Reading it:**

| Result | Meaning |
|---|---|
| `uid` non-null, `pg_role` = `authenticated` | Option A works. §12.4 stands, and the build can start. |
| `uid` null | Option A is falsified. §12.4 is wrong and Option B wins by elimination. |
| `function does not exist` | The SQL above has not been run. Not an answer. |

**Then remove all of it**, in the same sitting — delete
`app/api/admin/diagnostics/rpc-identity/route.ts` with its test,
`scripts/probe-rpc-identity.mjs` and its `package.json` entry, and run:

```sql
drop function if exists public.whoami_probe();
```

A diagnostic left in place becomes an endpoint nobody remembers adding.

### 12.5 A separate finding, not about identity

Seven of the twenty `SECURITY DEFINER` functions do not use the project's
`search_path = ''` standard:

| `search_path=public, pg_temp` | `search_path=public` |
|---|---|
| `book_vehicle`, `claim_dcl_submission`, `claim_invoice_submission`, `next_invoice_aa`, `redeem_promo` | `assert_least_privilege`, `release_promo` |

`pg_temp` is last in all five, which is the position PostgreSQL's own
documentation recommends, so the temp-schema shadowing vector is closed. The
residual exposure is `public`: an unqualified name inside those bodies resolves
there, which is safe only while no reachable role can `CREATE` in that schema.
The other thirteen do not depend on that assumption at all — an empty
`search_path` *forces* qualification, so a later edit cannot reintroduce the
problem by accident.

**Checked, 30 August. Both false.**

```
 nspname | authenticated_can_create | anon_can_create
 public  | false                    | false
```

`has_schema_privilege` counts privileges held via `PUBLIC` as well as those
granted to the role directly, so a false for both rules out the vector entirely
rather than for those two roles only. Nothing reachable can create an object in
`public` to shadow an unqualified name. **This is a tidiness item, not a
finding.**

**And it is not worth converting the seven.** Moving a function to
`search_path = ''` means schema-qualifying every reference in its body, and the
list includes `book_vehicle` and `create_web_booking` — the two functions the
website's entire booking path runs through. Real regression risk, against a
vector that is closed. The proportionate rule is forward-looking: **new
`SECURITY DEFINER` functions use `search_path = ''`**, which is already what the
recent ones do (038 and 039 among them), and the seven are left alone unless one
is being edited for another reason anyway.

Worth noting for its own sake: `assert_least_privilege`, the function that
checks least privilege, is itself on the looser pattern.


---

## 13. The Postgres half, settled by execution — 31 August 2026

§12.4 ended on a sentence that blocked everything:

> **This rests on one assumption that has not been tested and must be before any
> of it is built:** that `auth.uid()` resolves inside a `SECURITY DEFINER`
> function when the call arrives from a user-scoped client. It should — …— but
> "should" is what this whole document exists to stop relying on.

That is two claims wearing one coat, and they have different owners.

| | Claim | Whose behaviour | Testable here? |
|---|---|---|---|
| **(a)** | A request-scoped GUC survives the `SECURITY DEFINER` boundary, and `SET search_path = ''` does not disturb it | PostgreSQL | **Yes** |
| **(b)** | PostgREST populates `request.jwt.claims` for a request bearing a user's access token | Supabase / PostgREST | No — needs the live project |

Splitting them matters. If (a) were false the design would be dead and no
production diagnostic would revive it. Settling it locally turns what remains
from *"does this work at all"* into one narrow question about one vendor's
documented behaviour.

### 13.1 (a) is true, and it was executed rather than reasoned about

`lib/rpcStaffIdentity.test.ts` builds a Supabase-shaped database in PGlite —
which is a real PostgreSQL — with `auth.uid()` reproduced **exactly** from
Supabase's own migration `20211202183645_update_auth_uid.up.sql`, a `fn_owner`
role that owns the functions, and an `authenticated` role that calls them.

Ten assertions. The three that carry the argument:

- **Identity survives, privilege changes.** Called as `authenticated` with
  claims carrying `sub`, a `SECURITY DEFINER` function with `SET search_path = ''`
  returns that `sub` from `auth.uid()` *and* reports `current_user = fn_owner`.
- **The privilege change is real, not a label.** The same call reads a table
  `authenticated` cannot; a separate assertion confirms the direct read is
  refused with `permission denied`. Without that second assertion the first
  proves nothing.
- **`SET search_path = ''` is not the culprit.** The identical function with and
  without the clause returns the same subject. This was the obvious suspect,
  being the one thing the project's pattern adds on top of a plain definer
  function. It is ruled out.

The gateway of §2 is then built and exercised end to end: it admits a staff
member, refuses an authenticated stranger, refuses a member whose row was
deactivated, and refuses a service-role call.

**The tests were mutated to confirm they are not vacuous.** Making the function
`SECURITY INVOKER` fails 2; removing the membership check fails 2; pointing
`auth.uid()` at the `role` claim instead of `sub` fails 7.

### 13.2 Two things found by the suite failing, both worth keeping

**The refusal has two independent layers, and only one was designed.** With
EXECUTE granted the way §4.2 rule 6 says to grant it — to the role that needs it
and no other — a service-role call is refused *at the grant* and never reaches
the identity check. That is a second closed door, and it is fragile in a
specific way: a later `grant execute … to service_role`, added to make something
else work, removes it silently and leaves only the identity check standing. Both
layers are now asserted separately so neither can be mistaken for the other.

**Supabase's `auth.uid()` raises on an *empty* claims GUC rather than returning
NULL.** The definition ends in `::uuid` applied to
`current_setting('request.jwt.claims', true)::jsonb ->> 'sub'`, and `''` is not
valid JSON, so the result is `invalid input syntax for type json`. A custom GUC
reverts to `''` — not to unset — once a transaction that set it ends, so this
state is reachable on a pooled connection rather than hypothetical. It still
fails closed, but as a 500 rather than a clean refusal. **A gateway that means
to answer "not a staff member" should not answer "internal error" instead**, so
one is written defensively: read the claim into a variable and treat any failure
as no identity.

### 13.3 What is left, and why it is safe to build against

Only (b): that PostgREST sets `request.jwt.claims` for a user-scoped client.
That is Supabase's documented contract and every RLS policy on the project
already depends on it — `auth.uid()` in a policy has exactly the same
requirement — so it is not a novel assumption, merely one this project has not
watched with its own eyes.

**And the failure direction is the benign one.** If (b) were false, `auth.uid()`
would be NULL inside the gateway, the gateway would refuse, and the feature
would not work. A wrong assumption here produces a locked door, not an open one.
That inverts the usual caution about building on unverified ground: the cost of
being wrong is a broken check-in screen found on the first test, not a data
exposure found later.

### 13.4 Decision

**Option A is adopted.** Staff-initiated RPCs are called with a user-scoped
client constructed from the staff member's access token; the gateway verifies
`auth.uid()` against `staff_members` in the database, never against a JWT claim,
per §2 and the §11 resolution. `app_metadata.role` may narrow, never grant.

The blueprint's OPEN block is **narrowed, not deleted**. A builder may now:

- write the finalisation function and its gateway against this pattern;
- test them in PGlite, as this file does.

A builder may **not**, until diagnostic 10c has been run against the live
project by Tasos:

- grant EXECUTE on a gateway to `authenticated` in production;
- move any existing route off `supabaseAdmin`.

10c is unchanged and is in §12.4. It is now a confirmation rather than a
gate on the design.

**Why an agent did not simply run 10c.** It creates a function in the live
database, which is a migration, and `AGENTS.md` reserves applying one to Tasos
after a stale paste copy reached production once. Splitting the assumption was
the way to make progress without touching that rule — not a workaround for it.
