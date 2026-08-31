# Engineering safety net

**Status: implemented on a separate draft branch; no production or hosted
configuration changed.**

This document records the safeguards added after the 31 August 2026 review. It
does not replace the product blueprint, the staging runbook or professional
legal/accounting advice.

## What already existed

Before this change, the repository already had a substantial safety net:

- Vitest unit and database-migration tests;
- TypeScript and ESLint checks;
- translation, static accessibility and SEO audits;
- Playwright browser coverage in Chromium and Firefox;
- CodeQL on pull requests, pushes to `main` and a weekly schedule;
- SHA-pinned GitHub Actions;
- nightly encrypted database backups;
- protected `main` requiring the up-to-date `build` status and resolved
  conversations, with force-push and deletion disabled;
- GitHub secret scanning, push protection and Dependabot security updates.

The GitHub repository settings above were read through GitHub's API on
31 August 2026. Non-provider secret patterns, secret-validity checks and
repository-wide enforcement of full-length action SHAs were not enabled at that
time; the workflows themselves nevertheless use reviewed full SHAs.

## What this change adds

### One reproducible local verifier

`npm run verify:fast` runs typecheck, lint and all unit tests sequentially.
`npm run verify` then adds a production build, translation, static
accessibility, SEO and browser tests. It forces inert placeholder values instead
of inheriting usable production credentials. The migration-replay preflight is
implemented in independent draft PR #66; once that PR merges, its
`check:migration-replay` command should be inserted before the build here.

This does not imply that the repository's tests are defective when run in
parallel. A prior timeout was specific to one managed local environment and did
not reproduce elsewhere. Sequential execution simply gives both agents and a
human reviewer one stable, documented handoff command.

The full local command uses `next build --webpack`; GitHub CI continues to run
the ordinary `next build` and is the independent production-builder gate.

### Optional pre-push verification

The tracked `.githooks/pre-push` runs `npm run verify:fast`. It is deliberately
opt-in because Git configuration is shared by worktrees and silently changing it
from a feature branch would affect unrelated work. Enable it once per clone:

```bash
npm run hooks:install
```

CI remains authoritative because local hooks can be skipped.

### Dependency automation

Dependabot now checks npm and SHA-pinned GitHub Actions weekly. Production and
development minor/patch npm updates are grouped separately, while major updates
remain individual review decisions. A dedicated pull-request workflow rejects
new dependencies with a known `high` or `critical` advisory.

### Coverage as a diagnostic only

`npm run test:coverage` produces text, JSON summary and LCOV output across API
routes, business logic and instrumentation, including files that no test imports.
The diagnostic is capped at two workers because all-files instrumentation is
memory-intensive. There is intentionally no percentage threshold and coverage
does not run in CI or the standard verifier.

Coverage answers which code executed; it does not prove that an assertion would
detect the defect. This repository has already had tests that encoded the bug
and passed. The stronger rule is unchanged: a new regression test must be seen
failing against the unfixed implementation before the fix is trusted.

The first bounded diagnostic on 31 August passed 84 files / 834 tests and
reported 35.46% statements, 35.62% branches, 35.87% functions and 37.36% lines.
Those figures are a map of currently unexercised code, not a target or a quality
grade; they must not be turned into a ratchet without a separate decision.

## What remains outside this change

- The isolated staging/Sentry/e2e-CI implementation is kept in draft PR #66 so
  its hosted acceptance evidence can be reviewed independently.
- `.claude/settings.json` was already added through PR #75 and is not duplicated
  here.
- A database restore drill remains an operator-controlled exercise until the
  first real restore has been executed and its evidence recorded. Automating an
  unverified recovery procedure would create false confidence.
- Hosted checks that need credentials or vendor sandboxes remain **not run**
  until their own runbooks are completed; a skipped check is never reported as
  passed.
- Legal and accounting decisions proceed in parallel with the approved build
  roadmap. They gate only the specific legally dependent behaviours identified
  in the blueprint; they do not pause independent engineering work.
