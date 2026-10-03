# Agent access and monitoring

**Last verified:** 3 October 2026, Claude — tier 1 built and verified by firing it
(runbook section 16). Tiers 2–4 are **designed, not built**, and the four open
questions below are genuinely open: they are not rhetorical and none of them has a
chosen answer.

**What this document is for.** Two agents work on this project with network access,
a shared platform account where staging and production sit side by side, and — on
the operator's machine — a browser the agent drives inside logged-in sessions. This
is the design for keeping that observable. It is written to be read cold by a
reviewer who has not seen the conversation it came out of, because the point of
writing it down is to be argued with.

**Written to be attacked, not approved.** A monitoring design that looks complete
and has a hole is worse than no design, for the reason `.github/workflows/ci.yml`
already states about a different check: *"A check that reports success for
something it did not look at is worse than no check, because it gets believed."*
Section 6 lists what this design does not cover. If a reviewer finds a fifth gap,
the document was worth writing.

**How this gets reviewed.** [`agent-controls/fable-brief.md`](agent-controls/fable-brief.md) asks a second model to design the same thing from the problem statement alone, with no sight of this document — so that agreement means something. [`agent-controls/codex-adversarial-prompt.md`](agent-controls/codex-adversarial-prompt.md) then asks Codex to defeat whatever survives. The two are deliberately separate jobs: a reviewer asked to assess an architecture tends to improve it, and a reviewer asked to break one tends to find the holes.

---

## 1. What is being protected, and from what

**The asset:** the production Supabase project `idfavwwfiuncoudkcfsp` — customer
records, reservations, quotes — and the production Vercel deployment.

**The threat, in the operator's own words:** *task scope ≠ access scope.* An agent
asked to do something on staging has, at the moment of asking, the standing ability
to reach production: same platform account, one click away in a browser that is
already signed in. Nothing malicious is required. A misread instruction, or a
prompt injection carried in a web page the agent reads, is sufficient.

**Three distinct failure paths**, which matter separately because no single control
covers all three:

| # | Path | Example |
|---|---|---|
| **P1** | CLI / shell | `psql` or `curl` against the production host; `supabase link --project-ref <prod>` |
| **P2** | Agent's own tools | a fetch, or an MCP call, pointed at production |
| **P3** | **Browser, inside a logged-in session** | clicking *Delete* in the production Supabase dashboard |

**P3 is the hard one** and the honest centre of this document. It leaves no
trustworthy local trace, it is the path the operator's setup specifically creates,
and it is the one every agent-side control misses.

### What is explicitly out of scope

- **Defending against the operator.** These controls assume Tasos is not the
  adversary. They are about agent error, prompt injection, and making a mistake
  legible after the fact.
- **Defending against a fully compromised laptop.** If the machine is owned, local
  controls are gone. Tier 3 is designed to survive that; tiers 1, 2 and 4 are not.
- **Secrecy.** Both project refs are public — they ship in the client bundle.
  Nothing here depends on them being secret.

---

## 2. The one principle the design follows

`AGENTS.md` already states it, and it was written after a permission-rule set was
mistaken for a boundary:

> *"A rule that matches command strings is a reminder to the agent that wrote the
> command, not a control on what the process can do. The boundary that actually
> holds is credentials and environment separation."*

So every control below is labelled **enforced** or **advisory**, and the labels are
not decoration. An advisory control counted as enforced is how a gap becomes
invisible.

**The operator's binding constraint:** keep one platform account for now, and
accept post-hoc rather than real-time oversight. That constraint was weighed and is
accepted. Its consequence is stated plainly in section 5: on the current plans
**there is no platform-enforced staging boundary**, so the design cannot rest on
one.

---

## 3. The four tiers

### Tier 1 — deny the production data plane · **BUILT, enforced + advisory**

Covers **P1 and P2**, partially. Full detail and the firing evidence are in
section 16 of [`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md).

| Layer | Covers | Label |
|---|---|---|
| `WebFetch(domain:…)` deny in `.claude/settings.json` | P2 | **Enforced** |
| `Bash(curl*…)` / `psql` / `pg_dump` / `supabase link` denies | P1 | **Advisory** — defeated by a shell variable |
| `[features.network_proxy] deny` in `~/.codex/config.toml` | P1, P2, **and P3** | **Enforced** — the only layer that reaches the browser |
| `sandbox.enabled` | P1 at OS level | **Not enabled** — see section 6 |

`scripts/deployment-boundary-lib.mjs` is the single source of truth for which ref
is which; `tests/agentNetworkControls.test.ts` holds the deny lists to it and
asserts staging is never denied.

### Tier 2 — an event record the agent cannot edit · **DESIGNED**

**The problem it solves:** transcripts at `~/.claude/projects` and `~/.codex/sessions`
are written by the process being monitored, on the machine it controls, and are
deletable. Adequate against mistakes; worthless against a compromised agent.

**The design:** hooks, not transcript scanning. Both agents support lifecycle hooks
that run out-of-process; the model never executes them and cannot skip them. Emit
**three** events — `UserPromptSubmit` (what was asked), `PreToolUse` for Bash and
MCP (the command, before it runs), `PostToolUseFailure` (what was attempted and
refused) — to an append-only store **off the machine**. Claude Code can do this
natively with a `type: "http"` handler; Codex needs a command hook.

**Plus one enforced rule worth more than the logging:** a `PreToolUse` **deny** on
writes to `~/.claude/settings.json`, `.claude/settings*.json`, `~/.codex/config.toml`
and `hooks.json`. An agent editing its own guardrails is the only failure that makes
every other control here silently stop working, and nothing else detects it.

**Open questions Q1 and Q2 below are unresolved and block this tier.**

### Tier 3 — nightly production fingerprint · **DESIGNED. The important one.**

**The problem it solves: P3.** Nothing on the laptop can tell you that an agent
clicked *Delete* in the production dashboard. Production state can.

**Why it is nearly free:** the nightly backup workflow has eleven consecutive
successful runs, dumps `roles.sql`, `schema.sql` and `data.sql`, and uploads to R2
— from GitHub Actions, with credentials that exist nowhere near the agent. The
fingerprint is a diff step on a snapshot that is already being taken.

**Compare night-to-night:** the schema dump; roles and grants; row counts and
`max(created_at)` for `reservations`, `quotes`, `vehicles`; production environment
variable **names** (never values), hashed; Vercel production deployments with their
git SHAs; and `branches/main` protection, which is readable from an agent session.

**Survives everything the other tiers do not**: a compromised laptop, a deleted
transcript, a disabled hook, and the browser.

**Open questions Q3 and Q4 block this tier, and Q3 is a real design flaw.**

### Tier 4 — make the post-session check automatic · **DESIGNED**

`agent_watch.py` run by hand after sessions will stop happening. Bind it to
`SessionEnd` on both agents and have it push a **verdict**, not a report:

```
3 Oct · 2 sessions · 41 commands · 0 production identifiers · 0 blocked
```

One line when clean; detail only when not. A daily message that needs scrolling is
a daily message that stops being read, and then there is no oversight at all —
only files.

---

## 4. Open questions — unresolved, and two of them are flaws

These are recorded as open because resolving them by assumption is how a control
system acquires a hole that nobody looks for.

### Q1. Tier 2's collector credential lives on the machine the agent controls

If the hook posts with a token stored locally, the agent can read that token, and
therefore **forge or suppress entries**. The obvious direction is a write-only
credential plus a per-session sequence number so gaps are visible rather than
silent — but a sequence number the agent can also read is a sequence number it can
continue. **Not designed. Possibly not solvable on a single machine**, in which case
tier 2's honest claim is "detects mistakes" and not "detects an adversary", and it
should say so.

### Q2. Tier 2's failure mode is undecided, and neither answer is good

If the collector is unreachable: **fail closed** taxes every tool call and will be
switched off within a week; **fail open** leaves silent holes in the record exactly
when something is wrong. A third option — buffer locally and flush later — puts the
buffer back on the machine the agent controls, which is Q1 again.

### Q3. Tier 3's central invariant is wrong for this project

The rule as first drafted was *"every production change must be explainable by a
merge commit."* **This project applies migrations by hand**, from a byte-identical
paste copy, because `AGENTS.md` forbids an agent applying one. So legitimate schema
changes routinely have no automated trail, and the alarm would fire on every single
migration. **An alarm that cries wolf monthly is an alarm that gets muted**, and a
muted alarm is worse than none because it still looks present.

Candidate directions, none chosen: diff against the migration **files** in the
repository rather than against merge commits; or require a signed "expected change"
marker committed before a paste is applied. The second is more honest and adds a
step to a procedure that is already manual.

### Q4. "Applicable to every project" has no shape

The operator wants these controls on this project and on future ones. Copied files
drift and go stale silently. A Claude Code **plugin** with a bundled `hooks/hooks.json`
does not drift, but Codex has its own mechanism and there is no shared format
between them, so some duplication is unavoidable. **What is the unit of
distribution, and what keeps the two agents' halves in step?** Tier 1 answers this
in miniature — `tests/agentNetworkControls.test.ts` fails if the checked-in Codex
snippet and the Claude Code rules disagree — and that pattern may generalise, but it
has only been tried once.

---

## 5. The platform constraint, stated plainly

Verified 3 October 2026 against vendor documentation:

| Platform | Mechanism for staging-only access | Plan required |
|---|---|---|
| Supabase | Project-scoped roles | **Team or Enterprise** |
| Vercel | Project-level roles, and the Contributor role they require | **Enterprise** |

On the current plans, **a member cannot be restricted to staging**. Vercel's Pro
roles are all team-wide, and its documentation states that *"Developers can deploy
to production through merging to the production branch."*

**So the single-account decision means there is no technical staging boundary**, and
every control in this document is either a network deny or a detection. The free
routes to a real boundary, if that is ever wanted, are a **second Supabase
organization** holding only staging and a **separate Vercel team** — or, better,
giving agents no dashboard access at all and only scoped tokens: the Supabase MCP
server takes `project_ref`, `read_only` and `features`, and its documentation
recommends all three together.

One caveat that should not be lost: `read_only` protects **integrity, not
confidentiality**. A read-only token over production still reads customer rows,
which is what `DEFINING-STATEMENTS.md` §6 exists to prevent.

---

## 6. What this design does not cover

Named here so a reader does not have to infer it, and so a future reader cannot
mistake silence for coverage.

**A browser session already signed in to the production dashboard, at the time it
happens.** Tier 1's host-level deny cannot single out the production project's
dashboard, because that is a *path* under `supabase.com` and the deny matches
*hosts* — excluding it would take the staging dashboard and the Supabase
documentation with it. Tier 3 catches the *effect*, the next morning. **Same-day
detection of P3 does not exist in this design.** That is the residual risk the
single-account constraint buys, stated as a number: up to 24 hours.

**OS-level network enforcement for Claude Code.** `sandbox.enabled` is off. The
sandbox's allowed-domain list starts empty, so enabling it repository-wide would
break `npm ci` for every agent on the next run. It needs an allowlist built and
tested first. **Recorded as not done, never as done.**

**Everything outside the Bash sandbox, if it is ever enabled.** Per the Claude Code
documentation, Read/Edit/Write, WebFetch, hooks and local MCP servers run *outside*
it: *"a `denyRead` entry doesn't stop the Read tool, and `allowedDomains` doesn't
limit WebFetch."* Protecting `.env` is a permissions rule, not a sandbox setting —
`.claude/settings.json` already carries it.

**The Vercel production deployment path.** `api.vercel.com` serves every project,
so a deny would break staging. Branch protection and the existing
`Bash(vercel --prod*)` rule are what hold it, and branch protection currently
requires only the `build` check (open item E21).

---

## 7. What is already enforced and was found rather than built

Per `DEFINING-STATEMENTS.md` §11.1, the most expensive failure on this project is
re-deriving a settled fact, so these are named explicitly:

- **`scripts/deployment-boundary-lib.mjs` already refuses a staging deploy carrying
  a non-`sk_test_` Stripe key**, and already keeps a list of variables that must
  never reach a Preview deployment. The "staging may not be fully isolated" worry
  was partly addressed before this document existed.
- **`.claude/settings.json` already denies reading `.env*`**, which `AGENTS.md`
  identifies as the one entry in that file that is a real boundary rather than a
  speed bump.
- **Branch protection state is readable from an agent session** without any new
  credential, via `GET /repos/{owner}/{repo}/branches/main` — which is how E21 was
  verified. Tier 3 can read it on the same basis.

---

## 8. Order of work

1. **Tier 1 Codex half** — paste `agent-controls/codex-network-deny.toml` into
   `~/.codex/config.toml`. Open item **E22**, Tasos. The only control that reaches
   the browser.
2. **Resolve Q3**, then build **tier 3**. It is the only tier that addresses P3 and
   it reuses a backup that already works. Building it before Q3 is answered would
   produce the muted alarm described above.
3. **Tier 4** — small, and it makes the existing scanner actually run.
4. **Tier 2** — last, because Q1 may cap what it can honestly claim.
5. **Q4** — decide the distribution unit before copying any of this into a second
   project, not after.
