# Agent oversight: the consolidated position

**Last verified:** 3 October 2026, Claude.

Four inputs merged: Tasos's firewall proposal, Fable's independent design, Codex's
adversarial pass plus its own 459-line design on
`codex/agent-safety-guardian-20261003`, and Claude's design together with what was
actually built and fired today.

**This supersedes the two-document split.** Read this, then
[`RECONCILIATION-2026-10-03.md`](RECONCILIATION-2026-10-03.md) for the previous
round's detail. It is the fourth round and the first with measurements in it.

---

## 0. Two collisions to resolve before anything merges

Both agents wrote a design, and both chose the same filenames.

| Path | Claude's (on `main`) | Codex's (on its branch) |
|---|---|---|
| `docs/AGENT-ACCESS-AND-MONITORING.md` | threat model, enforced/advisory labels, the corrected browser claim | **459 lines**: policy architecture, adapters, phased build plan |
| the expected-change record | `supabase/expected-changes/` — **built and tested** | `docs/production-changes/` — designed |

**This is `DEFINING-STATEMENTS.md` §9's exact failure mode**, committed by both of us
on the same day: a parallel document rather than an extension of the one that owns the
subject. Resolution proposed in §5. It needs deciding before either branch merges, or
git decides it by merge order.

---

## 1. What is settled, with evidence

| Claim | Status |
|---|---|
| A rule-based gate can approve staging and deny production | **Built and fired.** Denied `node -e`, `curl`, `psql`, `supabase link`, `wget`, `python3` at production; allowed staging at 401; allowed `grep` of the ref |
| It works in Claude Code | **Fired live, in session** |
| **It does not work in the Codex desktop app** | **Measured.** App quit (`pgrep` confirmed), reopened, asked to `curl` production, returned 401, and the gate's log gained no entry — the hook was never invoked |
| `[features.network_proxy]` does not reach the browser | **Verified against vendor docs:** *"The network proxy only filters traffic from local commands that run inside the sandbox"* |
| Codex's origin rules cannot split production from staging | **Agreed by all four**, and Codex's §6 states it plainly |
| A merge-commit invariant is wrong here | **Agreed.** Migrations are applied by hand; it would fire on all 45 |
| Project-scoped roles need paid plans | Supabase Team+, Vercel Enterprise |
| A GitHub token cannot push-but-not-merge | **Verified.** Merging needs `contents: write`, the same permission as pushing |
| `main`'s `build` check binds even the owner | **Verified:** `enforcement_level: "everyone"`. Required reviews are **zero** |

---

## 2. The finding none of the four reached

All four concluded the browser path cannot be split, because the production and
staging dashboards are **paths under one host**. Codex's §6 calls it *"the design's
largest residual risk."*

**That is true of network and origin rules. It may be false of the browser's own
policy engine.** Chrome's `URLBlocklist` matches
`[scheme://][.]host[:port][/path][@query]`, longest matching path wins, and Chrome
evaluates the URL **before the request leaves the browser** — so the path is in clear
text to it. No TLS interception required.

```
URLBlocklist: supabase.com/dashboard/project/<production ref>
```

**Why four passes missed it:** every one of us reasoned at the network layer, where
the path sits inside TLS. Nobody looked at the browser's policy engine.

**Status: unproven, and one test decides it.** The Supabase dashboard is a single-page
app. If a client-side `pushState` navigation bypasses the blocklist, this catches a
typed URL and nothing else. Two further unknowns ride on the same test: the macOS
install route without MDM, and that Chrome policy applies per machine or user rather
than **per Chrome profile** — so it would block the production dashboard for Tasos
too, which argues for giving the agent a different browser build. **Open item E24.**

---

## 3. What each pass got wrong, including mine

Symmetry matters; a consolidation that only corrects other people is not one.

**Claude.** Claimed the Codex network proxy reached the browser, and built a priority
ordering on it. **False** — and the misreading was of two words inside a quotation I
pasted myself: *"separately"* meant a different mechanism, *"managed"* meant the
administrator file. The design also contradicted itself, §6 saying the browser was
uncovered while §3 said it was covered. And the guardrail rule was circular: a hook
protecting the file that configures the hook.

**Codex.** Proposed a GitHub token that pushes but cannot merge — **not possible**.
Recommended 10–15 minute monitoring, the wrong cadence for a manual response on
best-effort schedules. Listed `anadyon.gr` for denial, which is the public site, and
checking published claims against it is what caught A02. And its §5.1 adapter
**assumes the `PreToolUse` path covers the surface in use**; W32 shows it does not.

**Fable.** Recommended GitHub Pro for rulesets *if the repository is private* — **it
is public**, so the only money item evaporates. Its honest conditional saved it.

**Tasos.** The firewall proposal was right, and is running. See §4.

---

## 4. The firewall proposal, resolved

> *"Codex asks to access staging: approved. Production: denied."*

**Correct, and built.** One change: the decider is code, not a model. The question is
a string comparison — a model can be argued out of its answer, `===` cannot — and
prompt injection is risk 1 in this threat model, so an adjudicating model becomes a
second component that can be talked into saying yes.

**The composition rule that makes a model safe to add:** it may only **narrow, never
widen** — deny, or escalate to a person; never approve what the rule layer denied.
Under that rule a model earns its place where no rule settles the question, and the
live example is §13: *could a customer receive different terms, cover or treatment?*

| Surface | Status |
|---|---|
| Claude Code | **working, fired live** |
| Codex CLI | working |
| Codex desktop app | **no hook point — cannot be installed** |

So for Codex the same shape exists only with **Tasos as the decider**: per-site
approval, *Allow once* and never *Allow for all sites*, one-turn lifetime, no CDP,
downloads and uploads denied. That is Codex's own point 2, and the one item on its
ten-point list that genuinely gates the app.

**Five faults in the gate, every one found by using it, none by its seventeen unit
tests.** It denied a compound of permitted reads. It blocked its own repair four
times, and was then bypassed in one line by assembling a path from parts. Twice it
mistook *describing* a dangerous command for *running* one — the second time while
writing the worklog entry about itself. And it denied the shell command writing this
document, because a markdown table's `|` characters were parsed as shell pipes.

**All five were over-denials**, which is the failure that gets a control deleted
rather than the failure that lets something through. The reusable lesson: a gate that
reads command text cannot distinguish performing an action from describing one, and
the things that most often describe dangerous commands are the gate's own tests and
documentation.

---

## 5. The merged architecture

**Codex's structure wins; Claude's implementation and tests survive inside it.**

### 5.1 One policy, two adapters — adopt Codex's, replacing Claude's

Codex's §4 is better than what Claude built: a single versioned, secret-free policy
file in the repository, consumed by both agents' adapters, with a **schema version and
policy digest checked at session start** and a red control-health event on mismatch —
never a silent fallback to an older policy.

Claude's approach was two files held in step by a test. That works for two files and
does not generalise, which was open question Q4.

**Three of Codex's requirements carry over as stated:**

- **Immutable identifiers, not names or URLs.** Project, organization, team and
  repository IDs. Names change; IDs do not. Claude's module keys on refs only.
- **An expiry date on vendor assumptions.** Vendor behaviour was found wrong **three
  times in one day**. A policy that expires forces re-verification instead of
  inheriting a stale belief.
- **Hook failure is a control-health event, never proof the tool was checked.** The
  fail-open problem named properly — and W32 is what it looks like in practice.

### 5.2 Enforcement, by surface

| Surface | Control | Label |
|---|---|---|
| Claude Code tools | `PreToolUse` gate plus `permissions.deny` | **Enforced**, fired |
| Claude Code shell | `Bash(…)` denies | **Advisory** |
| Codex CLI | the same gate | Enforced, fired |
| **Codex desktop app** | **nothing agent-side** | **W32** |
| Codex browser | per-turn approval, human decides | Enforced, human-paced |
| Production dashboard path | Chrome `URLBlocklist` | **Unproven — E24** |
| Production data plane | scoped staging-only token | **Strongest available** |
| Production reads | `pgaudit` by role | Detection, not prevention |

### 5.3 From Fable — adopt

**Root-owned configuration**, so the guardrail rule stops being circular. **Root
pulls the transcripts** rather than the agent pushing them, which dissolves the
collector-credential problem and the fail-open/fail-closed choice in one move. And a
**heartbeat**, because nothing else distinguishes *clean* from *stopped* — it matters
more than monitoring frequency and should be done regardless of everything else.

### 5.4 Expected production changes — merge both

Claude's is **built and tested**: `supabase/expected-changes/`, twelve cases, both
load-bearing rules mutation-tested, the hash checked against the migration file.

Codex's design adds fields it lacks and should gain: **approving person**, the
**immutable** production identifier, **operation class and expected fingerprint
effect**, a **rollback reference**, an execution **window with a 24-hour maximum**, and
**consume-once semantics** — the watcher retires a record when all expected effects
match; extra, missing or late effects stay alerts; an expired unused record alerts and
closes as unused, never becoming a standing exception.

**Proposed:** keep Claude's implementation and test, extend the schema to Codex's
fields, settle on one path. Claude's sits beside the migrations it describes, which is
the better placement — but either is fine as long as there is exactly one.

### 5.5 Order of work

1. **E23** — no standing production session; the extension off the main Chrome
   profile. Free, immediate, the largest single reduction. *Tasos.*
2. **E24** — the five-minute Chrome test. Decides §2. *Tasos.*
3. **Heartbeat.** Free. *Agent.*
4. **Scoped staging-only Supabase token**; inventory and revoke the account-wide
   ones. *Tasos.*
5. **Restore drill** — never once performed, and the backup's only check lists an
   archive rather than loading it. *Tasos.*
6. **Require a review on `main`** — the one branch-protection gap. *Tasos.*
7. **The policy file and two adapters** (§5.1). *Agent.*
8. **`pgaudit`**, after the role question below. *Agent writes, Tasos applies.*
9. **The nightly watcher**, reading the audit log and the expected-change records.
   *Agent.*

---

## 6. Unverified, each blocking something named

| Unknown | Blocks | Test |
|---|---|---|
| Does `pushState` bypass `URLBlocklist`? | whether the browser path is enforceable at all | E24 |
| macOS managed-policy install without MDM | the same | install it, check `chrome://policy` |
| Which Postgres role the dashboard editor runs as | `pgaudit` seeing dashboard activity | `select current_user` in the dashboard SQL editor |
| Does the desktop app read **any** `~/.codex` policy file? | whether Codex can be gated at all | set a `requirements.toml` deny and attempt it |
| `browser_use.origins` | origin-level blocking | find it in the config schema, or drop the claim |
| Audit-log API availability on current plans | the watcher's inputs | check before building |
| Supabase scoped-token plan requirement | the credential model | create one |

**None is a detail.** The first decides whether §2 stands, and the fourth decides
whether anything agent-side can constrain the surface actually in use.

---

## 7. What to ask each reviewer

Repository access is **wanted** for both this round. The independent-derivation phase
is over; this is an attack round on a position that now has measurements in it.

### Codex

1. **W32 contradicts your §5.1.** Your adapter assumes the `PreToolUse` path covers
   the surface in use. Measured: app quit, reopened, `curl` at production returned
   401, and the gate's log gained no entry. **Is there any policy file the desktop app
   does read?** You can answer this authoritatively and we cannot.
2. **Does `URLBlocklist` survive `pushState` in the Supabase dashboard?** Your §6
   calls the browser the largest residual risk on the basis of *origin* rules. This is
   a different layer. If it holds, your §6 conclusion changes.
3. **Our designs share two filenames.** Which should survive, and will you take the
   merge or shall we?
4. The token split in your point 7 is not achievable; the cadence in point 8 and
   `anadyon.gr` in point 4 are argued against in §3. Push back if you disagree.

### Fable

1. **Attack §5.1.** Codex's policy-and-adapters design replaced both yours and ours.
   Does the schema-version-plus-digest check actually *prevent* a stale policy, or
   only detect one?
2. **Your root-pull resolution of Q1 and Q2 is adopted.** Does it survive W32 — an
   agent surface that invokes no hook at all, so there is nothing to log?
3. **The repository is public**, so your GitHub Pro recommendation does not apply.
   Does anything else in your design change on that fact?
4. Where would you spend money now, given that scoped tokens cover the credential
   half for free?

### Both

**What remains uncovered once E23 and E24 are done?** State the worst case that
survives and roughly how long it goes undetected. Our answer is: a production
dashboard action inside a supervised session, caught the next morning by the watcher.
We would like that contradicted.
