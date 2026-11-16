# Independent security review — 16 November 2026

**Last verified:** 16 November 2026, Codex independent reviewer.

Scope: quote lookup tracking, promo validation, cron authentication, proxy MFA
regression tests, and verified related database MFA drift. Owner alone approves
merges, production migrations and deployments. No hosted database writes made.

## Verified before implementation review

- Main is b9756e4. Production commit verification was supplied by the implementer.
- Independently read production gateway function definitions: all four public
  handover gateways require `coalesce(auth.jwt()->>'aal','') = 'aal2'` before
  resolving the staff role. Main's migrations contain no corresponding gate.
  A replay would lose this production protection; versioning is required.
- The deployed quote RPC exists, returns void, and increments lifetime counts.
  The proposed migration must preserve its signature.

## Reproduction and review evidence

- In an isolated reviewer worktree, copied only the new RPC-definition guard onto
  main: it failed naming `record_quote_lookup_failure`, and no other RPC.
- Adding migration 050 made that guard and seven SQL behavior tests pass (8/8).
- Replaced the local test function with the deployed definition, retaining its
  execution grants: four SQL tests failed, three passed. Eight calls during a
  20-second active block raised count 3 to 11 and the block to one hour; a count
  of 12 last updated 25 hours ago became 13 with another 24-hour block. No hosted
  calls were used for these behavioral tests.
- Reviewed migration 050: explicit per-IP row lock, current time after acquiring
  the lock, no mutation during an active block, unchanged thresholds, proposed
  24-hour idle reset, service-only execution, unchanged void signature.
- Route tests copied onto main reproduced missing cron-secret acceptance (200),
  promo wildcard acceptance, wrong first promo match, and absent Sentry reporting
  for quote tracking errors. Four assertions failed as expected.
- **Review finding:** the initial proxy MFA tests all passed against 5ebffe1.
  Every negative fixture used `nextLevel: 'aal2'`, which also activates the old
  conditional. Asked implementer to cover absent/aal1/unknown nextLevel values;
  the password-only case with nextLevel aal1 must fail against the old proxy.

Full verification and final implementation review are still pending. The
24-hour reset remains an owner decision; hosted staging acceptance and all
production changes remain unperformed.

## Final implementation review

Reviewed the five implementation worktrees after the initial MFA finding was
addressed. No remaining actionable implementation finding in the reviewed
changes. This is a code-review conclusion, not release approval.

- Corrected proxy tests were independently copied onto main with proxy.ts from
  `5ebffe1`: **10 failed, 18 passed**, including password-only API and page
  requests, unknown/missing levels and absent assurance data. Restoring main's
  proxy made all 28 admin-access tests pass.
- Direct handover gateway tests on main's migrations: **4 failed, 4 passed**.
  The four negative cases reached AN404 instead of the MFA gate, while the AAL2
  controls proved the privileged fixture was real. Adding migration 051 made
  all eight pass. Read-only production function definitions independently
  confirm the migrated MFA gate bodies are already deployed.
- Copied all five final implementations into the isolated reviewer worktree.
  Independent focused run: **9 files, 89 tests passed**, including quote SQL
  behavior and upgrade, RPC declaration, public quote error reporting, promo
  route and helper, cron guard and route wiring, proxy MFA, handover MFA, and
  migration paste parity. Used a reviewer-only filesystem cache and disabled
  results caching to avoid shared-dependency cache collisions.
- Independent complete migration replay: **50 migrations passed**, including
  the new 050/051 pair, with the synthetic seed applied twice and verified.
- Quote migration now uses timestamp filename
  `20261116120000_record_quote_lookup_failure.sql`; paste 050 is byte identical.
  Upgrade test starts from the live void-returning definition. Row locking
  establishes inter-session serialization by SQL review; PGlite's queued calls
  are an active-block stability check, not a multi-connection concurrency test.
- Promo helper preserves legitimate underscores, escapes LIKE syntax and makes
  exact comparison the final acceptance check. Cron helper preserves configured
  credential bytes, accepts existing short secrets, and denies absent/blank
  configuration before work. No new production configuration is required.

The implementer owns final lint/typecheck/full-suite/build and hosted CI status;
these independent focused checks do not substitute for those release gates.
No migration was applied to hosted staging or production, no staff credential
was changed, and no merge or deployment was performed. Owner approval is still
required for merging/releasing, the proposed 24-hour idle reset and migration
application. Hosted staging acceptance and authenticated production MFA journeys
remain unverified by this review.

## Final delta and owner-policy addendum

The implementer supplied the owner's explicit selection: reset after 24 hours
without a failure. That policy decision is settled; owner merge, migration
application and release approval remain separate and pending.
Quote 85bd110 removes only the unnecessary legacy schema snapshot append;
canonical migration/paste/tests are unchanged. Independent final delta review
found no issue. Hosted CI results and the explicit skipped live-schema check are
recorded in the implementation verification report.
