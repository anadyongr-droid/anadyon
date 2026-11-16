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
