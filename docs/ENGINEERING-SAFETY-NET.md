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
`npm run verify` then adds migration replay, a production build, translation,
static accessibility, SEO and browser tests. It forces inert placeholder values
instead of inheriting usable production credentials. The replay implementation
arrived through independent foundation PR #66.

This does not imply that the repository's tests are defective when run in
parallel. A prior timeout was specific to one managed local environment and did
not reproduce elsewhere. Sequential execution simply gives both agents and a
human reviewer one stable, documented handoff command.

The full local command uses `next build --webpack`; GitHub CI continues to run
the ordinary `next build` and is the independent production-builder gate. The
verifier gives Node and Next's TypeScript worker a 4 GB heap ceiling because the
current generated route graph exceeds Node's 2 GB default on the constrained
local runner.

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

### Three ways a Dependabot pull request fails for reasons that are not the dependency

*Added 24 October 2026, after eleven queued pull requests were worked through
in one sitting and three of them failed for reasons the diff could not show.*

The queue had built up behind the W59 merge hold. Working it revealed that a red
`build` on a dependency bump is usually **not** about whether the new version
works, and each of the three causes below is diagnosable in minutes once it is
named — and cost an hour each before it was.

**1. An exact peer pin makes a split bump unsatisfiable.** `@vitest/coverage-v8`
peer-depends on an exact `vitest` version — `4.1.11` requires `vitest@4.1.11`,
`5.0.5` requires `vitest@5.0.5` — so #214 and #215 each bumped one half and
**neither could ever go green**, failing at `npm ci`:

```
npm error Conflicting peer dependency: vitest@4.1.11
npm error   peer vitest@"4.1.11" from @vitest/coverage-v8@4.1.11
```

Dependabot opens one pull request per package and cannot combine two, so the fix
is to push the other half onto one of the branches and let the second be closed
as superseded. **The tell is that the failure is at the install step**, before
any test runs. Any package pair pinned to each other exactly behaves this way;
`@vitest/*` is the family to expect it from.

**2. A grouped action bump cannot contain a workflow that did not exist yet.**
#220 bumped `actions/setup-node` in four places and was opened on 20 October;
`restore-drill.yml` was added to the repository later the same day with the old
pin. Merging `main` into the branch therefore produced a tree with two different
SHAs for one action, and `lib/actionPinParity.test.ts` failed naming the line:

```
.github/workflows/restore-drill.yml:83 actions/setup-node v7.0.0
```

This is the parity test doing its job — it exists because #83 once bumped
`codeql-action/init` alone and would have run a split CodeQL bundle. **The fix
is to complete the bump by hand**, and the general rule is that any action pin
added to a *new* workflow while a group bump is open will collide with it. Worth
checking `git grep` for the old SHA whenever a grouped action pull request goes
red after a branch update.

**3. A loose peer range hides a plugin that does not support the new major.**
#170 (eslint 9 → 10) fails the Lint step with exit code 2 — eslint's fatal
configuration error, not a lint violation — because `eslint-plugin-react@7.37.5`,
vendored inside `eslint-config-next@16.3.5`, calls `context.getFilename()`, which
ESLint 10 removed. `eslint-config-next` declares `eslint: ">=9.0.0"` while the
plugin it bundles declares `^3 || … || ^9.7`, so npm installs the combination
without complaint and the failure appears only at lint time. **There is no
version to upgrade to**: `eslint-plugin-react@latest` is still 7.37.5 with the
same ceiling, so no released version supports ESLint 10, and an `overrides` entry
has nothing newer to point at. #170 is blocked upstream and the honest action is
to say so and leave it open, not to reach for a canary `eslint-config-next`.

*Provenance, and it is not flattering.* This diagnosis was **already in
`docs/README.md`'s open-pull-requests table** from early October, in almost
these words, and it was re-derived from scratch today before the existing entry
was noticed. §9 is the rule that was broken, and the mechanism is worth naming
because it is not the one §9 warns about: the file *was* found by a grep, and
its status section *was* read — the pull-request table further down was not.
Finding the right document is not reading it. What today added is a dated
re-verification rather than a discovery: the plugin is **still** 7.37.5 as of
24 October, so "no fix exists yet" is now true with a date against it rather
than true whenever it was last looked at.

**What the three have in common** is that the annotation GitHub exposes says only
`Process completed with exit code N`. Logs and artifacts are unreachable from an
agent container (W51), and the step index in the annotation is not a file line.
So the method that works is to **reproduce the install and the failing step
locally** — `npm ci` from an empty `node_modules`, then the one step that failed
— rather than reading the diff and reasoning about what the new version might
break. All three causes above were found that way in minutes; none was visible
in the diff.

### The staging e2e concurrency group silently cancels queued runs

> **Correction, 26 October 2026 — this was not a discovery, and the section
> below originally read as one.** All of it except the measurement was already
> in **E11** of `docs/OPEN-ITEMS.md`, and had been since **20 September**: the
> group name, the one-pending-run mechanism, the fact that the check goes grey
> rather than red, the operational rule *"check the E2E conclusion explicitly
> before merging and re-run a cancelled one"* — which is the workaround used on
> 24 October and presented here as a method — and the same two candidate fixes.
> **W62 is withdrawn as a duplicate** and the new evidence is folded into E11.
>
> What was genuinely new is one thing: **the measurement, and that it corrects
> E11's own observation (2)**, which had concluded the hazard *"does not arise"*
> with a single agent merging serially. With eleven pull requests queued it
> arises badly — four sat unmergeable with nothing red, and five of the nine
> merges that day paid a wasted `build`-plus-e2e cycle, about an hour, on
> nothing to do with any diff. So contention is the condition, as E11 says, but
> serial merging does not make it safe; it makes it **invisible until the queue
> is long**, which is when it costs most.
>
> **The §9 failure is the part worth keeping.** This is the second in three
> days — the first being the eslint 10 diagnosis already recorded in
> `README.md`'s pull-request table — and both have the same shape: the right
> document was opened and the relevant row was not read. `OPEN-ITEMS.md` is the
> file §12 obliges every agent to read at the start of every day, and it had
> been read that morning. §9 says to search for the subject rather than the
> filename; the sharper rule these two misses point at is that **opening the
> right file is not reading it**, and a file of this length has to be searched
> *within*.

*Found 24 October 2026, and it is the reason four pull requests sat at
`mergeable_state: unstable` with nothing red.*

`ci.yml`'s `e2e-staging` job carries:

```yaml
concurrency:
  group: anadyon-staging-e2e
  cancel-in-progress: false
```

The group name is a **constant**, deliberately: the job writes to the shared
staging database and two runs must not overlap. But a constant group is shared
across every branch and pull request, and GitHub holds only **one** pending run
per group — when a third arrives, the one already waiting is **cancelled**.

With one or two pull requests open this is invisible. With a queue of eleven,
`End-to-end against staging` came back `cancelled` over and over, on diffs that
had nothing to do with staging. **A cancelled required check is not a red check
and not a green one**, so the pull request is unmergeable with no failure to
investigate — which reads exactly like a flake and is not one.

**The workaround used today:** merge strictly one at a time, and re-run the
cancelled job (`actions/runs/<id>/rerun-failed-jobs`) for each pull request on
its own rather than updating several branches at once. Slow but reliable.

**Not fixed, and the options are a genuine trade-off rather than an oversight:**

- *Per-ref group* (`anadyon-staging-e2e-${{ github.ref }}`) stops the
  cancellations but allows two runs to hit the one staging database at once,
  which is the thing the constant group exists to prevent.
- *Run it on `main` only* and drop it as a required check on pull requests. That
  removes the serialisation problem entirely, at the cost of learning about a
  staging break after merge rather than before. It also needs a branch-protection
  change, which is a dashboard action.
- *Keep it and accept serial merging*, which is what happened today and is fine
  for a queue of two or three, not of eleven.

Recorded as **W62** in `docs/OPEN-ITEMS.md` rather than decided here, because the
right answer depends on how much the pre-merge staging signal is worth — and that
is worth one deliberate decision rather than three silent cancellations.

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

The final bounded diagnostic on 31 August passed 88 files / 866 tests and
reported 36.52% statements, 36.71% branches, 37.54% functions and 38.35% lines.
Those figures are a map of currently unexercised code, not a target or a quality
grade; they must not be turned into a ratchet without a separate decision.

### A cloud session's working copy is not storage, and an increment is cheap to commit

*Added 27 October 2026, after four finished files were lost and recovered by
luck.*

On 26 October the mail bridge's Stage 1 was built in four increments. The first
— the validation boundary, its 36 adversarial tests, the Zoho interface and the
import-boundary test — was committed and pushed as `7c3c88a`. The next three —
`store.ts`, `relay.ts`, `relay.test.ts` and the four extension files, about 716
lines with 62 passing tests behind them — were written, tested, and left in the
working copy to be committed together at the end of the batch.

The session's container was then reclaimed. A cloud session's container is
ephemeral by design and the repository is cloned fresh when a new one starts, so
the next session opened on `main` with a clean tree and none of that work in it.
`git stash list`, the reflog and every remote branch were empty of it: it had
never been written anywhere that survives.

**It was recovered from the session transcript**, which stores each tool call
including the heredocs that wrote the files, and which happened still to be on
disk at `/root/.claude/projects/<project>/<session>.jsonl`. Extracting the four
`Bash` commands whose input mentioned the service and replaying them restored
the files byte-for-byte. That is a usable recovery route and worth knowing, but
it is luck, not a safeguard: nothing promises the transcript outlives the
container, and a session that had been compacted differently might not hold the
writes at all.

**The rule this produces.** `DEFINING-STATEMENTS.md` §11 already says it —
*"unpushed branches are not a handover"* — and the loss here was not a handover
failure but the same sentence applied to the session's own next hour. So:

- **commit each increment when its tests go green**, not when the batch is
  finished. The branch is a draft; a draft commit costs nothing and can be
  amended, squashed or reworded later.
- **push after each commit**, for the same reason. A commit in a container that
  is about to be reclaimed is worth exactly as much as an uncommitted file.
- **a batch of work that takes more than one increment has more than one
  commit.** Where a single logical change really does span the batch, push the
  branch anyway and let the final commit tidy the history.

**And one thing that did work.** Because the recovered tests had been proved
against deliberate breaks in a *different* working copy, the two ordering tests
were re-broken and re-watched to fail in the restored one before the work was
committed. A regression test recovered from a transcript has the same standing
as a regression test somebody else wrote: it has not been proved here until it
has failed here. Both breaks reproduced the original failures exactly — the
recovery was faithful, and that is now a checked fact rather than an assumption
about a replayed heredoc.

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

---

**Last verified:** 27 October 2026, Claude — the increment-commit section added
after the mail-bridge loss; the Dependabot and concurrency sections unchanged
since 24 October.
