# Open question: how does a database function know *which* staff member is calling?

**Status: open. No decision taken.** Written 28 August 2026 for outside review.
Nothing in this document has been implemented, and the blueprint section it
concerns (`RENTAL-SYSTEM-BLUEPRINT.md` §4.2, the check-out / check-in counter)
is marked OPEN and blocked on the answer.

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
