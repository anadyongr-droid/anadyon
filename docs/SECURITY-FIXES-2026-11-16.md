# Security fixes verification — 16 November 2026

**Last verified:** 17 November 2026, Codex (implementer); independent review recorded separately.

## Owner SQL follow-up after initial handover

Tasos explicitly authorized merging the green PRs #260–#265. All five
implementation PRs are now merged. GitHub strict branch protection required
updating and rechecking each subsequent branch as main advanced. No protection
or failed check was bypassed. #265 delivers the final documentation record.

| PR | Checked head | Merge commit | Fresh CI run |
|---|---|---|---|
| 260 | 85bd110 | 191a0a3 | [43958201437](https://github.com/anadyongr-droid/anadyon/actions/runs/43958201437) |
| 261 | 8fad276 | b9cb967 | [43971052522](https://github.com/anadyongr-droid/anadyon/actions/runs/43971052522) |
| 262 | 5ec62a2 | 10402b1 | [43972771703](https://github.com/anadyongr-droid/anadyon/actions/runs/43972771703) |
| 263 | 4275c26 | 9f6880a | [43974807586](https://github.com/anadyongr-droid/anadyon/actions/runs/43974807586) |
| 264 | 56e5e1f | 6f0e31d | [43976646659](https://github.com/anadyongr-droid/anadyon/actions/runs/43976646659) |

Every listed head had all checks SUCCESS, including hosted build, security,
preview and staging, before merge. One #262 merge attempt was held by automatic
review because its last visible context still showed staging running; an explicit
fresh check proved all checks green and the exact-head retry succeeded. No
alternate merge path was used to bypass that rejection.

Tasos supplied the original five function definitions as backups, reported
applying both 050 and 051 and passing the provided staging tests, then reported
successful production steps too. Read-only verification independently confirms
all five installed function bodies match the reviewed paste SQL exactly in
**both staging and production**, including SECURITY DEFINER, empty search_path,
and the intended service-only quote/authenticated-only handover permissions.
The SQL was applied by Tasos, never by the agent. The older sections below retain
the initial investigation and pre-owner-handover state.

A separate production catalog check compared all 29 declared tables using the
repository's schemaDeclarations.mjs parser: no missing tables, missing columns
or unexpected columns within the declared tables. This does not execute the
credential-dependent PostgREST check:schema command, which was not run by the agent; its output has not been supplied.
A production account recheck still found 3 staff/admin accounts, 1 without a
verified MFA factor. The account action and authenticated acceptance are separate
from successful SQL application; password/session rotation is not independently
verified.

## Verified starting state

Read the uploaded “Anadyon security fixes — implementation proposal” (Nov 16),
AGENTS.md, OPEN-ITEMS.md, documentation status, WORKLOG and relevant blueprint.
This task implements the proposal; owner-only merge and release approval overrides
AGENTS.md's older merge autonomy. No hosted schema or configuration was changed.

Main is `b9756e441ea4a4089793d1d20a000045a5783c1e`. Vercel's public
`anadyon.gr` alias resolves to READY production deployment
`dpl_7BVZgqgBXcoMR915MvaB4rzsaKsJ`, which carries the same SHA. This verifies
release identity, not an authenticated customer/staff acceptance journey.

Production Supabase `idfavwwfiuncoudkcfsp` and staging
`fzycvstifmltxybffinq` both already have
`public.record_quote_lookup_failure(text) RETURNS void`. The production history
records `20261116003721_atomic_quote_lookup_failures`. The function is absent
from main's migration chain. Therefore the proposal's production-missing
hypothesis is false; its repository drift finding is true. Production grants
allow service_role and deny anon/authenticated. The live function retains lifetime
counts and advances blocks on every concurrent failure. A read-only last-24h log
query found zero PostgreSQL error messages mentioning that RPC; this is not proof
that every invocation succeeded.

All three cron routes compare against `Bearer ${process.env.CRON_SECRET}`.
Vercel environment metadata lists CRON_SECRET for production and scoped staging;
no secret was decrypted and its current value/non-emptiness was not verified.
The missing-secret bypass is reproducible locally. There is no claim it is
currently exploitable in production.

Promo validation uses unescaped ilike with an allowed underscore. The booking
RPC itself matches `lower(code) = lower(trim(p_promo_code))`. Validation disclosure
is verified in deployed source and reproduced with mocked query results; no real
promo was enumerated or redeemed against production.

Production contains 3 staff/admin accounts, 1 with no verified MFA factor.
Password rotation status is unverified. No account or session was changed.

## Implementation and decisions

1. `codex/quote-lookup-failure-function`: version the existing void signature,
   serialize changes with a row lock, leave active blocks immutable, preserve
   thresholds 3/30s, 5/10min, 8/1h, 12/24h. Tasos explicitly selected a reset
   after 24 hours without a failure during this chat. Preserve valid IP keys;
   map blank/missing inputs to unknown. Add privacy-safe handled-error reporting
   while keeping the public 404 unchanged. Migration 050 has a byte-identical
   paste copy. Changing the proposal's RETURNS TABLE to void avoids PostgreSQL's
   prohibited CREATE OR REPLACE return-type change on the existing function.
2. `codex/promo-exact-match`: escape LIKE metacharacters and require an exact
   case-insensitive row comparison before exposing discount fields. Preserve
   literal underscores. Uses the existing Data API query, avoiding a second
   production migration for this small fix.
3. `codex/cron-auth-fail-closed`: shared timing-safe guard rejects absent/blank
   secrets; preserves configured credential bytes and imposes no new length rule.
4. `codex/proxy-mfa-regression-test`: request-level proxy tests. The proposal's
   original nextLevel=aal2 fixture passed against 5ebffe1, so it was corrected to
   test aal1/missing/null/unknown nextLevel and absent assurance data. These cases
   cover the actual old bypass. No proxy implementation change is needed.
5. `codex/version-handover-mfa`: related verified drift. Both hosted databases
   already require aal2 in all four authenticated handover gateways, but main's
   migrations do not. Production history records
   `20261116000310_require_aal2_for_handover_gateways`. Migration 051 preserves the
   exported live function bodies and explicit authenticated-only grants. This
   protects rebuilt databases from losing existing MFA enforcement.

## Fail-first evidence

- Main RPC inventory guard fails naming only record_quote_lookup_failure.
- Main promo tests: wildcard returns valid=true; multiple rows use the wrong
  matched record. Exact-case-insensitive control passes.
- Main watchdog accepts Bearer undefined with CRON_SECRET deleted (200 vs 401).
- Main quote fault path returns 404 but does not report the handled fault.
- Proxy 5ebffe1 fails the corrected MFA fixture (5 failures before expanded
  nextLevel matrix); original proposal fixture passed and was not trusted.
- Main handover migrations fail all 4 direct authenticated password-only cases;
  all 4 aal2 controls reach the implementation and return AN404 for the absent
  fixture handover. After migration all 8 cases pass.
- Reviewer additionally replayed the existing live quote function locally:
  active-block and idle-reset tests fail; proposed version passes. PGlite uses
  a single serialized connection; no multi-session concurrency claim is made.

## Initial release handover — before owner follow-up

At the initial handover, implementation branches targeted main independently
and merge/release authorization was pending. No hosted migration had been applied
at that point. The subsequent owner application and authorized merges are recorded
above. The initial owner checklist required applying the reviewed SQL to staging and
perform authenticated MFA, direct RPC, literal/wildcard promo and quote lockout
acceptance tests. Local PGlite is SQL verification, not hosted Supabase acceptance.

050: use the paste file from the quote PR, matching its timestamped migration.
051: use the paste file from the gateway PR, matching its timestamped migration.
These migrations have independent subjects and no mutual dependency. The existing
live MFA gates already match 051; check definitions/grants before reapplying.
For 050, retain the old function definition for rollback; rollback restores
lifetime counting/extension behavior and should be an explicit owner decision.
Neither migration deletes customer rows or resets existing histories on application.

After owner-applied 050, in an explicit transaction on staging first:

```sql
begin;
select public.record_quote_lookup_failure('handover-test-20261116');
select fail_count, blocked_until from public.quote_rate_limits
where ip = 'handover-test-20261116'; -- first call: 1 / null
rollback;
```

The RPC returns void by design; read the table to check its count. Use the local
SQL regression suite for the complete threshold/expiry cases; do not manipulate
real production client history. Repeat the approved smoke check on production
only after staging acceptance and owner approval.

Owner actions: enrol or remove the staff account without a verified factor,
rotate staff passwords/revoke old sessions using the normal account process,
confirm cron's deployed configuration with the authenticated health check, and
complete real staff MFA login/page/API checks. No passwords were requested.

## Other advisory observations

Supabase health advisors return no findings. Security advisors flag public
pgaudit extension/event-trigger functions, intended authenticated handover
SECURITY DEFINER functions, 26 RLS tables with no client policies, and disabled
leaked-password protection. These are not all exploitable defects: deny-by-default
server-only tables need no client policy, and handover functions enforce caller,
role and assurance themselves. No extension permissions or paid-plan settings
were changed. Leaked-password protection and extension grants need owner/vendor
review before any configuration change. See the linked Supabase guidance in the
final verification report when assessing them.

## Validation and review

Independent review: no outstanding implementation findings. The reviewer ran
89 focused tests across 9 files, reproduced the before-fix failures independently,
and replayed all 50 migrations. The committed reviewer record is
[the independent worklog](worklog/2026-11-16-codex-reviewer.md).

| Subject | PR | Reviewed implementation |
|---|---|---|
| Quote tracking | [260](https://github.com/anadyongr-droid/anadyon/pull/260) | 85bd110 |
| Exact promo validation | [261](https://github.com/anadyongr-droid/anadyon/pull/261) | 3d77196 |
| Cron guard | [262](https://github.com/anadyongr-droid/anadyon/pull/262) | a31548a |
| Proxy MFA tests | [263](https://github.com/anadyongr-droid/anadyon/pull/263) | 0d91ad9 |
| Versioned handover MFA | [264](https://github.com/anadyongr-droid/anadyon/pull/264) | c22c910 |

Required hosted build jobs passed on all five implementations: typecheck,
lint (0 errors, 24 existing warnings), complete unit suite, `npm run build`,
translation/accessibility/SEO audits and Chromium/Firefox browser checks. Quote's
latest 85bd110 only removes the unnecessary legacy schema snapshot append;
its final hosted rerun passed the build and staging jobs. The
migration, paste copy and test source are unchanged and independently re-reviewed.

| PR | Full unit tests | Hosted build run |
|---|---:|---|
| 260, original reviewed implementation | 1,757 / 152 files | [43956651820](https://github.com/anadyongr-droid/anadyon/actions/runs/43956651820) |
| 260, final snapshot-only cleanup | 1,757 / 152 files | [43958201437](https://github.com/anadyongr-droid/anadyon/actions/runs/43958201437) |
| 261 | 1,757 / 151 files | [43956677718](https://github.com/anadyongr-droid/anadyon/actions/runs/43956677718) |
| 262 | 1,754 / 150 files | [43956693530](https://github.com/anadyongr-droid/anadyon/actions/runs/43956693530) |
| 263 | 1,759 / 149 files | [43956721535](https://github.com/anadyongr-droid/anadyon/actions/runs/43956721535) |
| 264 | 1,756 / 150 files | [43956749035](https://github.com/anadyongr-droid/anadyon/actions/runs/43956749035) |

At the initial handover, all five implementation PRs were ready for owner review,
with hosted build, security/preview and staging checks green. They have since
merged as recorded above. Staging reruns completed
serially after the shared queue canceled waiting jobs (existing W62 behavior).
That queue behavior remains documented; a cancellation was never counted as a pass.
Each staging commercial-path suite passed 84 tests / 10 files.

| PR | Passing staging job |
|---|---|
| 260 | [133622916172](https://github.com/anadyongr-droid/anadyon/actions/runs/43958201437/job/133622916172) |
| 261 | [133622604157](https://github.com/anadyongr-droid/anadyon/actions/runs/43956677718/job/133622604157) |
| 262 | [133624861406](https://github.com/anadyongr-droid/anadyon/actions/runs/43956693530/job/133624861406) |
| 263 | [133627810186](https://github.com/anadyongr-droid/anadyon/actions/runs/43956721535/job/133627810186) |
| 264 | [133617067043](https://github.com/anadyongr-droid/anadyon/actions/runs/43956749035/job/133617067043) |

Check each PR's current head checks before approval; these links preserve the
measured state, not a promise that future checks will stay green. Documentation
PR 265 has no product-code changes; its final documentation-only update may
still be running checks when this record is read.

The hosted “Schema drift check” step logged an explicit **skip** because the
production credentials are absent. Local `check:schema` likewise exited 2 for
missing credentials. Neither is a passed live schema verification. Read-only MCP
inspection verified only the specific functions, grants and columns documented
above; no production service key was fetched to bypass that separation.

Local quote typecheck and lint passed. The first local full-suite run hit one
process-test timeout while a duplicate production build consumed resources; the
isolated rerun of all five process tests passed. The complete local suite was
retried with two workers and passed all 1,757 tests / 152 files. The first local build attempt lacked network access for
fonts; its network-enabled retry was stopped when hosted builds had completed,
so a full local build is **not claimed as passed**. Hosted CI is the full build
and full-suite evidence. Final focused quote checks passed 35 tests / 4 files at
85bd110, and both paste files were rechecked byte-for-byte.

CI's commercial-path tests can create and clean synthetic staging fixtures;
these are authorized tests. No migration was applied by the agent, and no staff
credential was changed by the agent. At the initial handover, production had not
yet changed. The subsequent owner-applied SQL, reported SQL tests and authorized
merges/deployments are recorded above. The commercial-path suite alone did not
establish hosted acceptance of the new 050 SQL; that followed through the owner
steps and the independent definition/permission checks above.

Advisor guidance: [RLS with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[public extensions](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[public definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Performance advisors also list informational index observations, which were not
changed as part of this security task.

## Initial handover production recheck

Before handover, GitHub main and the public Vercel deployment were rechecked:
both remain b9756e441ea4a4089793d1d20a000045a5783c1e and the public deployment is
READY at dpl_7BVZgqgBXcoMR915MvaB4rzsaKsJ. Supabase migration history still lists
the earlier Nov 16 gateway/quote migrations, not these new 050/051 files. This
work prepared reviewed PRs; it did not merge them or release the fixes.
