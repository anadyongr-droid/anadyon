<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:anadyon-agent-roles -->
# Working on this project

Two agents work here — Claude and Codex — and they swap between two roles.
Read this before starting anything.

Everything below applies to both. Nothing here is about which model you are;
it is about which chair you are sitting in.

## The two roles

**Architect.** Decides what to build and why. Writes the decision down *before*
any code exists, in `docs/RENTAL-SYSTEM-BLUEPRINT.md` — the scope, the reason,
what was deliberately excluded and why. Does not implement.

**Implementer.** Builds what the blueprint says, and only that. Where the
blueprint is silent or wrong, stops and says so rather than inventing a design
mid-branch. Does not quietly redesign.

Which role you hold is stated by Tasos when the work is handed over. If it was
not stated, ask — do not assume you are both.

## Swapping

The handover is the document, not the conversation. A role swap means the next
agent reads `docs/` and continues from there, so:

- an architect's output is a blueprint section a different agent can build from
  without asking questions;
- an implementer's output is merged code plus, where a decision was forced
  mid-build, a note back into the blueprint saying what changed and why.

If the next agent has to reconstruct your reasoning from a chat log, the
handover failed.

## Rules that exist because they were broken

Each of these cost real production time on this project.

- **Read what is already written before researching it again.**
  `DEFINING-STATEMENTS.md` §9. A full competitor benchmark was researched from
  scratch while the blueprint sat committed and unread — and the duplicate was
  worse than the original. Search `docs/` for the subject, not the filename.
- **Verify claims; never assume.** `DEFINING-STATEMENTS.md` §8. Schema against
  the live database, vendor behaviour against vendor docs, UI against a rendered
  page. If it cannot be checked, label it unverified.
- **A reproduction must be able to reproduce.** Assert the preconditions first —
  that the table really overflows, that the box really is shorter than its
  content. Three frozen-pane fixes were validated against repros that could not
  exhibit the bug. See `docs/HANDOVER-ADMIN-FROZEN-PANES.md`.
- **A new regression test must fail against the unfixed code.** Run it that way
  and watch it fail before trusting it. Tests here have twice asserted the bug
  and passed.
- **Never apply a Supabase migration.** Write the numbered migration and its
  byte-identical `supabase/migrations/paste/` copy, and hand both to Tasos.
  `lib/migrationPasteParity.test.ts` enforces the pair; a stale copy reached
  production once.
- **Do only what was asked.** An idea worth having is worth raising, not
  building unasked.

## Decide it yourself

*Added 31 August 2026, by Tasos: "going forward i don't want to receive any
requests for me to review matters that agents can do and that should include
everything under review and all internet domains. Of course all use should be
for the purposes of this project and not against the law."*

**The default is to act.** Take the decision, do the work, write down what you
decided and why, and carry on. Do not queue a choice for Tasos because it feels
significant, because it touches security, or because you would like the
reassurance. A design call, a schema shape, a library, a refactor, a domain to
read, a PR of your own to merge — yours.

Two things do not change, and they are not exceptions to this rule so much as
the reason it can be safe:

- **Write down every decision that a later reader would otherwise have to
  reconstruct.** Autonomy without a record is just undocumented change. The
  blueprint's §10 is where they go.
- **Raise a real objection once, then do as asked.** If a request looks wrong,
  say so in a sentence or two and proceed unless told otherwise. Silence is not
  agreement and neither is a fifth restatement.

### What still comes back — and why each one is here

This list is short on purpose. If it grows, something has gone wrong.

- **Anything an agent physically cannot do.** Vercel and Supabase dashboards,
  the environment's network policy, a vendor email, a browser session with a
  second factor. Do not ask for a decision on these; say plainly what is needed
  and hand over the exact steps or the paste-ready text.
- **Money and contracts.** Signing up to a paid tier, committing spend,
  accepting vendor terms.
- **Answers only a professional can give.** Counsel and the accountant — see
  `docs/GATE-0-QUESTIONS.md`. Asking is not reviewing.
- **Applying a Supabase migration.** Still Tasos's, per the rule above, and
  still because a stale paste copy reached production once.
- **Irreversibly destroying real data**, or anything else with no undo that
  reaches customers. The purge design in blueprint §4.2b is the shape: an agent
  builds and proposes, a person confirms.

**Not on the list, and specifically so:** which domains to read, whether a
design is significant enough to check, whether to merge your own green PR,
whether a security-shaped change is "too sensitive to decide". Decide.

## What `.claude/settings.json` does, and what it does not

*Added 31 August 2026, after Gemini suggested a permission-rule set and the
suggestion was half right.*

`.claude/settings.json` is checked in, so it applies to both agents and changes
are reviewable in a diff rather than living in somebody's home directory. It
does two useful things:

- **`allow`** removes prompting for the commands this project runs constantly —
  read-only git, `npm test`, `npm run *`, `tsc`, `vitest`, `playwright`. Fewer
  prompts on safe work means the ones that remain are worth reading.
- **`deny` on `Read(./.env*)`** is the one entry that is a real boundary. It is
  a *tool-level path rule*, so it stops an agent pulling the service-role key
  into its context and transcript — and `docs/HANDOFF-H1.md` §7 is the reason:
  *"Never commit `.env.local`. It holds live secrets."*

**Everything else in `deny` is a speed bump, and should be read as one.**
Blocking `Bash(git push --force*)` does not stop `git push --force-with-lease`
spelled differently, a shell alias, or a two-line script. Blocking
`supabase db reset` does not stop the equivalent SQL through the API. A rule
that matches command *strings* is a reminder to the agent that wrote the
command, not a control on what the process can do.

**The boundary that actually holds is credentials and environment separation.**
An agent that cannot reach production cannot damage it, whatever it types. That
is why the Vercel preview scoping mattered on 30 August, why the staging project
is on the list at all, and why a `deny` list is not a substitute for either.
Adding rules here is cheap and worth doing; believing them is not.

## Not colliding

One worktree and one branch per agent, both pushing to
`anadyongr-droid/anadyon`. Never two agents in the same working copy.
`~/Desktop/anadyon` is Tasos's own checkout — leave it alone.

Branch names are prefixed by task, not by agent: `codex/<what-it-does>` is the
existing convention and stays, whichever agent is working.

**Separate worktrees also mean separate disks.** Neither agent can free space in
the other's sandbox, and the repository is not what fills one — `.git` is 17 MB
and the largest tracked file is under half a megabyte. `docs/SANDBOX-DISK.md`
has what actually uses the space, what is safe to delete, the one directory that
is not, and why `df` misleads when the limit is a per-session allowance rather
than a full volume.

## Where the remaining work is defined

- `docs/RENTAL-SYSTEM-BLUEPRINT.md` §7 — the build order, phases 1-6, in
  dependency order. Phase 2 (check-out / check-in) is the one that unlocks the
  most: contracts, fuel and mileage charges, damage evidence and the
  maintenance feed all depend on it.
- `docs/RENTAL-SYSTEM-BLUEPRINT.md` §7 deferred — including the partner /
  affiliate channel, the one capability the local competition has and this
  system does not.
- `docs/audits/` — the ten review areas and what each audit did *not* cover.
  Areas 2 (design) and 5 (content and legal) are ungraded; area 5 held a
  blocker.
- `docs/HANDOVER-ADMIN-FROZEN-PANES.md` — open UI defect, with three disproved
  theories recorded so they are not retried.
- Open PRs: #16 gated NBG payments, #31 incident closure.
- `codex/incident-admin-middleware-timeout` has never been merged and has no PR.

Before starting any of it, check whether the blueprint already answers the
question. It usually does.

## Starting the day

**Read [`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md) before picking up any task.**
`DEFINING-STATEMENTS.md` §12 makes this obligatory. It is the live list of
everything outstanding — unfinished work, unanswered questions, unapplied
migrations, expiring insurance, known defects — each with a named owner. Check
its dated section against the calendar; those items do not announce themselves.

Then read the status section at the top of `docs/README.md`, and the most recent
entry in `docs/WORKLOG.md`.

If something important is missing from the open items list, the list is wrong
and fixing it is the first task. Any agent may add to it at any time.

## Ending the day

`DEFINING-STATEMENTS.md` §11, obligatory for every agent:

**Every agent** writes `docs/worklog/YYYY-MM-DD-<agent>.md` before the session
ends — what was done, what was decided, what was discussed and not decided, what
turned out to be already done, what is left broken or unverified, and what needs
Tasos. One file per agent per day: two agents appending to a shared file would
collide every day. Update the document that owns each subject you touched and
refresh its `Last verified:` line.

**Claude** then reads every agent's summary and consolidates: brings the living
documents and the `docs/README.md` status section level with reality, writes the
day's entry in `docs/WORKLOG.md`, and updates `docs/OPEN-ITEMS.md` — closing
what closed, adding what opened, re-dating what is still open.

Do it while there is still context to do it with, not in the last exchange.

## Verification before handoff

Use one of the repository-owned verification commands instead of assembling a
different command list in each session:

- `npm run verify:fast` is the minimum local edit loop: typecheck, lint and the
  complete unit suite, run sequentially.
- `npm run verify` adds the migration replay preflight, a production build,
  translation, static accessibility, SEO and Chromium/Firefox browser tests.
  The replay implementation arrived through foundation PR #66.

The sequential command is a reproducibility aid, not a claim that parallel test
execution is broken. GitHub CI remains the independent merge gate and uses the
normal Next.js builder; the local full verifier uses webpack because the managed
Codex sandbox cannot bind Turbopack's helper port.

If a hosted or credential-dependent check is skipped, record it as **not run**,
never as passed. Coverage is available on demand with `npm run test:coverage`,
but is intentionally not a threshold or merge gate: executing a line does not
prove that a regression test detects the defect. The fail-first regression rule
above remains mandatory.
<!-- END:anadyon-agent-roles -->
