# INCIDENT — admin area unreachable, middleware times out

**Status: SELF-RESOLVED. Cause never established. Expect recurrence.**
Opened: 2026-08-23 ~16:45 UTC · Access returned: ~19:50 UTC · Duration ≈ 3 hours
Production commit throughout the outage: `fe8eb3a`
Impact: `/admin` completely unreachable. The public website was unaffected.

## 0. Read this first

**Access came back on its own.** It returned *before* the timeout hardening in
PR #30 was deployed, so **that change did not fix it** and must not be recorded
as the remedy. Nothing was deployed, reverted or reconfigured in the window
where behaviour changed. It simply started working again.

That matters more than a tidy closure would:

- A fault that heals without intervention has not been removed. It will very
  likely return.
- Every hypothesis in §5 was tested and disproved. There is **no** established
  cause — not Supabase, not the role claim, not a cookie race, not a wedged
  deployment.
- Because it self-resolved, the failure was **transient and external to the
  code** — which narrows it, but only to "something between the Vercel
  invocation and Supabase Auth, intermittently".

**If it recurs, capture the evidence in §6 before doing anything else.** With
PR #30 now deployed, a recurrence fails in ~8s with a log line naming the
stalling call, instead of hanging for five minutes and naming nothing. That log
line is the missing fact this whole document is short of.

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

## 8. Questions — answered and still open

Answered during the incident:

| Question | Answer |
|---|---|
| Does `app_metadata.role` read `admin`? | **Yes** — `{"role":"admin",…}`. Disproved the role-claim theory (§2b). |
| Was Supabase down? | **No.** Auth `operational`; the project's own endpoints answered in 116–212ms (§2b). |
| Did a deploy cause it? | **No.** Nothing deployed on 23 Aug touched `proxy.ts`, the login page or the auth path. Two of the four deploys were documentation only. |
| Was it a wedged deployment? | **Unknown, and untested** — access returned before the redeploy/PR #30 landed. |

Still open, and the ones that matter on recurrence:

1. **Which call stalls?** With PR #30 deployed, the log now says:
   `[proxy] auth call "<label>" did not answer within <n>ms; giving up`.
   The label is one of `getUser`, `getUserById#1`, `mfa`.
2. Does it affect other admin accounts, or only one session?
3. Does it reproduce from a different network or device?
4. Is it correlated with a session needing token renewal? The Chrome log's
   `POST` (renewal) then `GET` pattern hints at this, but two samples is not
   evidence.

## 9. What changed as a result

- **PR #30** (merged, `f3d100c`): every middleware auth call is bounded at 8s,
  the role lookup no longer retries into three consecutive hangs, and the login
  page always clears its spinner. **This did not fix the outage** — it makes the
  next one fail in seconds, legibly, and name the culprit.
- **Not fixed:** the underlying fault. Nothing was found to fix.

## 10. If it happens again

1. **Do not retry repeatedly.** One attempt, then collect.
2. Vercel → Logs → Runtime → find the failing request. Capture:
   - the `[proxy] auth call "…" did not answer` line — **the label is the answer**
   - the **External APIs** rows, expanded to show URLs
3. Note whether the login page showed `?unavailable=1` and the amber banner —
   that confirms the middleware gave up deliberately rather than hung.
4. Only then consider a redeploy, so the evidence is not lost with the instance.
