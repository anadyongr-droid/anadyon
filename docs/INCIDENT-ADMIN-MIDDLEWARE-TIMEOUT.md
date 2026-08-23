# OPEN INCIDENT — admin area unreachable, middleware times out

**Status: UNRESOLVED. Cause not established.**
Opened: 2026-08-23, ~16:45 UTC
Written: 2026-08-23 17:03 UTC
Production commit at time of writing: `fe8eb3a`
Impact: **Tasos cannot reach `/admin` at all.** The public website is unaffected.

This document separates what is **verified** from what is **inference**. Two
plausible-sounding causes were already proposed and disproved during the first
hour; both are recorded in §5 so nobody spends time re-deriving them.

---

## 1. Symptom

Reported by Tasos, in his words: the login does not get past the 2FA step.
Refined by questioning:

- Password step succeeds.
- The TOTP step **accepts a correct code without showing an error**.
- Entering a *deliberately wrong* code **does** show "Incorrect code".
  → Therefore TOTP verification itself is working. The failure is after it.
- Navigating directly to `https://anadyon.gr/admin` "loads forever".
- That request ends in a Vercel error page:

```
504: GATEWAY_TIMEOUT
Code: MIDDLEWARE_INVOCATION_TIMEOUT
ID:   fra1::8tbl7-1787503717104-8d82ea640f73
```

## 2. Verified facts

All measured directly, 2026-08-23 17:03 UTC, unauthenticated unless stated.

| Probe | Result |
|---|---|
| `GET /` (public) | 200 in **0.096s** |
| `GET /admin` (no session) | 307 → `/admin/login` in **0.426s** |
| `GET /admin/login` | 200 in **1.287s** |
| `POST /api/promo/validate` (read-only DB query) | 200 in **2.242s** |
| `GET /admin` (**with a valid session**) | **times out — MIDDLEWARE_INVOCATION_TIMEOUT** |

### Confirmed from the Vercel runtime log (unauthenticated path)

Log for one of the probes above (`GET /admin`, request
`m524p-1787504591857-5e04202960b5`, user agent `curl/8.7.1`):

```
Middleware:        307 Temporary Redirect
Execution Duration: 353ms
External APIs:      No outgoing requests
Redirect Location:  /admin/login
```

Two things follow, and the second is the useful one:

1. The unauthenticated path makes **zero** Supabase calls — it short-circuits
   before `proxy.ts:83`. That is why it is fast, and it means the anon-path
   timings above say nothing about the authenticated path.
2. **Vercel's runtime log has an "External APIs" section that lists outgoing
   requests.** On the *failing* authenticated request, that section will name
   the Supabase call that stalled — which is precisely the unknown in §4.
   Getting that log is therefore the whole ballgame.

Further verified:

- Production is on `fe8eb3a`. Deploys today: `c3e5fc5` 14:07, `330e814` 14:26,
  `0bdbfb6` 14:31, `fe8eb3a` 14:56 UTC.
- **No deploy today touched authentication, the middleware, or MFA.** The
  changed files were email delivery auditing, CodeQL regex fixes, and docs.
- PR #29 (pricing/promo/seat work) is **open and unmerged**. It is not on
  production and is not implicated.
- Admin worked normally earlier the same afternoon: the PR #26 deployment was
  verified against live admin endpoints after 14:07 UTC.

### Notable: Supabase responses are slow but working

A trivial `select` through PostgREST took **1.54s**, then **2.24s** twenty
minutes later. That is slow for the query involved, and it is getting slower.
This is **not** proof of anything, but it is the most concrete anomaly found so
far and should be the first thing re-measured.

## 2b. The failing requests, and what they rule out

Two Vercel runtime logs for the failing request, both `MIDDLEWARE_INVOCATION_TIMEOUT`:

| | Chrome | Safari |
|---|---|---|
| Request ID | `8tbl7-1787503717104-8d82ea640f73` | `wwp7b-1787503969432-8a2c5b2e3102` |
| Started | 18:48:37 (+02) | 18:52:49 (+02) |
| Duration | **300.0s** | **300.3s** |
| External APIs | **POST**, then **GET** | **GET**, then **GET** |
| Referer | — | `/admin/login` |

Both ran to **300 seconds** — the Fluid compute ceiling, not the usual 25s
middleware cap — and both issued **only two** outgoing calls before dying.

### Supabase is NOT the thing hanging

The project host is `idfavwwfiuncoudkcfsp.supabase.co` (public — it ships in
the client bundle). Measured directly, 2026-08-23 ~17:10 UTC, using the public
anon key:

| Call | Result |
|---|---|
| `GET /auth/v1/settings` | **200 in 0.123s** |
| `GET /auth/v1/user` (bogus bearer) | 403 in 0.212s |
| `POST /auth/v1/token?grant_type=refresh_token` (invalid token) | **400 in 0.116s** |
| `GET /rest/v1/` | 401 in 0.053s |

The `POST …/token` endpoint — the exact call in the Chrome log — answers in
**116ms**. The project's Auth service is healthy and fast.

**Therefore:** the middleware's outbound calls are hanging even though the
service they target is responsive. The problem is on the Vercel side of that
connection, or in the middleware code path itself — not in Supabase.

### RESOLVED SUB-QUESTION: the role claim IS present

Checked 2026-08-23 ~17:15 UTC via `select id, email, raw_app_meta_data,
last_sign_in_at from auth.users`:

| email | `raw_app_meta_data` | last sign-in |
|---|---|---|
| a.maroudas@gmail.com | `{"role":"admin","provider":"email",…}` | **2026-08-23 17:10:12Z** |
| anadyon.gr@gmail.com | `{"role":"staff",…}` | 2026-08-19 |
| customerservice@anadyon.gr | `{"role":"staff",…}` | null |

**The role claim is present**, so `if (!role)` is false, the role-resolution
block is never entered, and the dynamic-import candidate below is **disproved**.

Note `last_sign_in_at` = 17:10 UTC: sign-in at the Auth level *is* succeeding,
consistent with password and TOTP both working.

By elimination: with the claim present, the middleware issues `getUser()` and
then the MFA pair. **The MFA pair appears in neither log.** So the stall is
inside `supabase.auth.getUser()` — which, for a session needing renewal, is
exactly the `POST …/token` + `GET …/user` pair in the Chrome log, and the two
GETs in the Safari one.

That call answers in 116–212ms from outside (§2b) but hangs from Vercel `fra1`
against the same endpoint. **The open question is therefore Vercel-side —
the runtime or the network path — not Supabase.**

**Untried, and the cheapest next thing:** both failing requests ran on the same
deployment, `dpl_63FHzdqP7yvgYUNYZoEciapJh8dY`. Redeploying that commit
unchanged gives a fresh instance and would clear a wedged runtime. It changes
no code and is trivially revertible.

### Superseded candidate (kept for the record)

Only **two** external calls were issued. A request with a valid session should
produce more: `getUser()` (`proxy.ts:83`), then the parallel pair
`getAuthenticatorAssuranceLevel()` + `listFactors()` (`proxy.ts:185-186`). The
MFA pair does not appear in either log.

So execution stopped **between `getUser()` returning and the MFA calls being
issued** — which is the role-resolution block, `proxy.ts:96-178`. That block
contains, at `proxy.ts:137`:

```ts
const { supabaseAdmin } = await import("@/lib/supabase");
```

A **dynamic import inside middleware**, of a module that constructs two
Supabase clients at module scope. It runs **only when the token carries no role
claim**. This is a candidate, not a conclusion — it needs the `[proxy]` console
lines to confirm which branch was taken.

## 3. The structural weakness this exposed

Independent of the cause, `proxy.ts` makes the admin area fragile:

- `export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] }` —
  it runs on **every** admin page and API call.
- On the authenticated path it makes **three to six sequential Supabase Auth
  calls**:

| Line | Call | Notes |
|---|---|---|
| `proxy.ts:83` | `supabase.auth.getUser()` | every request |
| `proxy.ts:138` | `supabaseAdmin.auth.admin.getUserById()` | **only if the token carries no role claim — retried up to 3× with 120ms/240ms backoff** |
| `proxy.ts:185` | `mfa.getAuthenticatorAssuranceLevel()` | every request |
| `proxy.ts:186` | `mfa.listFactors()` | every request (parallel with the above) |

- **None of these has a timeout.**

So if Supabase Auth is slow, the admin area does not degrade — it disappears,
because the middleware exceeds Vercel's invocation limit before rendering
anything. There is no fallback and no fast path.

`HANDOFF-CODEX-2026-08-23.md` §10.4 already flagged this as a latency concern
("the broader claims-based fast path remains unfinished"). This incident shows
the failure mode is worse than latency: it is a total lockout.

**This is worth fixing regardless of what caused today's outage.**

## 4. What has NOT been established

- **Which of the four calls is stalling.** Unknown.
- **Why it started today.** Nothing deployed today explains it.
- **Whether it is Supabase-side at all.** Not demonstrated.
- Whether it affects other admin accounts, or only Tasos's session.
- Whether it is reproducible from a different device, browser or network.

## 5. Theories already disproved — do not re-derive

### 5.1 "Cookie race after `mfa.verify()`" — WRONG

Proposed because the login page calls `router.push("/admin")` (a soft
navigation) straight after `mfa.verify()`, which could plausibly send stale
cookies and be bounced by `proxy.ts:200`.

**Disproved by:** the failure is a *timeout*, not a redirect back to the login
page. A cookie race would produce a fast bounce to `/admin/login?mfa=1`, not a
504 after ~25s.

### 5.2 "Supabase outage" — WRONG

Proposed on the basis of `status.supabase.com` reporting **"Partially Degraded
Service"** with **API Gateway = `degraded_performance`**, plus an open incident
["401 errors due to JWT rejections"](https://stspg.io/18v97b9scdh2).

**Disproved by** `https://status.supabase.com/api/v2/components.json`:

| Component | Status | Last changed |
|---|---|---|
| API Gateway | `degraded_performance` | **2026-08-14** (nine days prior) |
| **Auth** | **`operational`** | 2026-07-28 |
| Database | `operational` | 2026-08-05 |

The gateway flag is a nine-day-old standing state, unchanged today, during
which the admin area worked — including earlier the same afternoon. **Auth,
the service the theory depended on, is reported operational.** Supabase's own
status page shows *no incident opened on 23 August*.

This was a case of fitting evidence to a story already formed. Recorded here as
a caution, not just as a dead end.

## 6. Next step — the one thing that will answer this

**Read the Vercel runtime log for the failed request.**

Vercel dashboard → project → **Logs** → Runtime → filter on request ID
`fra1::8tbl7-1787503717104-8d82ea640f73`, or the last 30 minutes for `[proxy]`.

**Find the right request.** It is the one with a **504 / timeout**, a real
browser user agent, and a long execution duration — *not* a fast `307` from
`curl` (those are the diagnostic probes in §2 and carry no Supabase calls).

Read two parts of that log:

- **External APIs** — lists the outgoing Supabase calls and their durations.
  Whichever is missing a completion, or shows a multi-second duration, is the
  stall. This directly answers "which of the four calls".
- **The `[proxy]` log lines** — see the table below.

`proxy.ts` emits three distinctive lines. Which one appears — and which does
not — narrows this immediately:

| Log line | What it means |
|---|---|
| `[proxy] no role claim in token for <email>; falling back to lookup` | The token has no role claim, so **every** request runs the 3× retry lookup. Strong candidate. |
| `[proxy] role lookup failed for <id>; denying:` | The lookup errored. The message carries the underlying error — read it. |
| `[proxy] no role for <id> (<email>); refusing admin access` | Resolved to no role; denial is by design, not a timeout. |

If **none** appear before the timeout, the stall is at `proxy.ts:83`
(`getUser()`), before any logging.

## 7. Recovery options, in order of preference

Not yet attempted — listed so whoever picks this up does not improvise.

1. **Check `app_metadata.role` on the account — do this first.** Supabase
   dashboard → Authentication → Users → the account → `app_metadata` must
   contain `role: "admin"`.

   This is now the **highest-value action**, because §2b shows execution
   stopping inside the role-resolution block. If the claim is missing, every
   request enters that block, hits the dynamic import at `proxy.ts:137` and the
   3× retry loop — and restoring the claim makes the middleware skip the whole
   thing. **It requires no deploy and would restore access immediately.**

   If the claim *is* present, that branch was never entered, the candidate in
   §2b is wrong, and the stall is at `getUser()` itself.
2. **Read the `[proxy]` console output** for the failing request (the log lines,
   not just the request summary) to confirm which branch ran.
3. **Check Supabase → Authentication → Logs** for throttling or errors against
   this project specifically. The platform status page is project-agnostic and
   was already misleading once (§5.2).
4. **Only then** consider code changes — bounded timeouts on the four Auth
   calls, and completing the claims-based fast path so the common case makes
   zero network lookups.

### Do not

- Do not deploy a speculative middleware change while the cause is unknown; an
  untested guess landing on the one path that is already broken can make the
  lockout permanent rather than intermittent.
- Do not weaken the role check. `proxy.ts:127-165` denies on an unresolved role
  **deliberately** — the comment records that the previous fallback to "staff"
  handed the customer database to any account that signed up. A lockout is
  recoverable; that was not.
- Do not retry the login repeatedly. Each attempt issues several more Auth
  calls, which cannot help and may compound throttling if throttling is
  involved.

## 8. Open questions for Tasos

1. What does the Vercel runtime log show for that request ID?
2. Does `app_metadata.role` still read `admin` on the account?
3. Does the same failure occur from a different browser, device or network?
4. Can any other admin account reach `/admin`, or is it everyone?
5. Roughly when did it last work? (Known good: after 14:07 UTC today, when the
   PR #26 deployment was verified against live admin endpoints.)
