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

## Not colliding

One worktree and one branch per agent, both pushing to
`anadyongr-droid/anadyon`. Never two agents in the same working copy.
`~/Desktop/anadyon` is Tasos's own checkout — leave it alone.

Branch names are prefixed by task, not by agent: `codex/<what-it-does>` is the
existing convention and stays, whichever agent is working.

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
<!-- END:anadyon-agent-roles -->
