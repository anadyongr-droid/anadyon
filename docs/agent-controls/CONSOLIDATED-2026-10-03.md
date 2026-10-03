# Agent oversight: the consolidated position

**Last verified:** 3 October 2026 (evening), Claude — **revised after Codex reviewed the controls themselves and upheld six findings, four of which meant a control was not a control.** Section 8 is that round and the repairs; section 9 is the test inventory and the list of what no test here reaches. The assurance labels in sections 4 and 5 are weaker than they were this morning and the mechanisms are unchanged. Earlier: 3 October 2026, Claude — four inputs consolidated.

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
| A rule-based gate can approve staging and deny a **directly addressed** production call | **Built and fired.** Denied `node -e`, `curl`, `psql`, `supabase link`, `wget`, `python3` at production; allowed staging at 401; allowed `grep` of the ref. **Not a firewall** — three bypasses in §8.3, one of which cannot be closed by this mechanism |
| It works in Claude Code | **Fired live in session, and re-proven at the process boundary**: `tests/productionGateProcess.test.ts` spawns the hook and asserts the stdout JSON, the stderr reason and exit 2 together — the contract, not the policy |
| ~~It does not work in the Codex desktop app~~ | **WITHDRAWN, and it was the reverse of the truth — see §8.2.** The app does load `hooks.json`; the file we gave it was invalid, so nothing loaded it on any surface and the measurement was vacuous. Left visible rather than deleted, because a reviewer should see which claim in this table failed and how |
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
too, which argues for giving the agent a different browser build. **Open item E29.**

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

| Surface | Status | How that is known |
|---|---|---|
| Claude Code | **working** | fired live in-session, and again from a shell |
| Codex CLI | **not established** | claimed working here on 3 October; no run proves it, and the file it would have loaded was invalid |
| Codex desktop app | **supports the hook; ours did not load** | the app's own inventory, queried by Codex: zero hooks with the file as shipped, gate found and enabled with the `hooks` wrapper added |

**This table said the desktop app had no hook point, and that was wrong** — see §8.
The file was malformed, so nothing loaded it on *either* surface, which is also why
the CLI row cannot claim a working gate. The corrected template is structurally
checked in CI and **not yet fired on the Mac**; `/hooks` plus one deliberate denial
closes it.

Even with the hook working, the browser needs **Tasos as the decider**: per-site
approval, *Allow once* and never *Allow for all sites*, one-turn lifetime, no CDP,
downloads and uploads denied. A click in a logged-in dashboard is not a tool call,
so no `PreToolUse` hook sees it. That is Codex's own point 2, and the one item on
its ten-point list that genuinely gates the app.

**Ten faults in the gate so far. Seven were found by using it, two by a reviewer
using it, and one — the tenth — by a unit test, which is the first time the suite
caught anything.** Six are over-denials: a compound of permitted reads; blocking its
own repair four times (then bypassed in one line by assembling a path from parts);
twice mistaking *describing* a dangerous command for *running* one, the second time
while writing the worklog entry about itself; a markdown table's `|` parsed as shell
pipes; and, this afternoon, **the `python3` heredoc that was writing these very
corrections**. Three are under-denials, all three Codex's (§8). The tenth was the
`2>&1` segmentation bug, caught by the test written for the fix one minute earlier.

One more, cosmetic and worth naming because of what it provokes: the denial said
*"acts on the production project with `&&`"*, then `cd`. **A refusal that names an
operator reads as a bug, and the reader's next move is to retry the command spelled
differently** — the one response a guardrail must not invite. It now names the
segment that actually reaches production, and `cd` is no longer treated as an action.

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
| Production dashboard path | Chrome `URLBlocklist` | **Unproven — E29** |
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

1. **E28** — no standing production session; the extension off the main Chrome
   profile. Free, immediate, the largest single reduction. *Tasos.*
2. **E29** — the five-minute Chrome test. Decides §2. *Tasos.*
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
| Does `pushState` bypass `URLBlocklist`? | whether the browser path is enforceable at all | E29 |
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

1. **W32 is withdrawn and your §5.1 stands — you were right and the measurement was
   worthless.** What is left is one run we cannot do: `/hooks` on the Mac, **trust**
   the corrected hook, fire `curl` at the production host, and confirm the decision
   log gains a line. Two corrections rode in on yours and need the same run: a
   `_comment` key fails the strict schema too, so the wrapper alone was not enough,
   and `matcher: "*"` is not a valid regex where Codex matches on them — `".*"` is
   our fix and is unverified.
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

**What remains uncovered once E28 and E29 are done?** State the worst case that
survives and roughly how long it goes undetected. Our answer is: a production
dashboard action inside a supervised session, caught the next morning by the watcher.
We would like that contradicted.

---

## 8. Round two: Codex reviewed the controls themselves, and four of them were not controls

*Added 3 October 2026, evening. Codex reviewed branch `claude/pr59-collaboration-lwcnia`
at `3d7e3f9` against `origin/main`, ran the three relevant suites (37 tests, all
green), and then **used** the things the suites were green about. Six findings, all
upheld. Nothing in staging or production was touched by the review or by the repairs.*

**The pattern is the finding.** Every one of the six is a control that a test said
was present and a run said was absent — or a document that said both. Three of them
were **inert while green**, which is the specific failure this project has now hit
four times: the stale §5 pricing paragraph, the insurance count read from prose
instead of the table, W32, and now two Codex config files.

### 8.1 The two paste-ready Codex files did not load at all

| File | What it said | What Codex's loader said |
|---|---|---|
| `codex-hooks-template.json` | `PreToolUse` at the top level | `unknown field PreToolUse, expected description or hooks` |
| `codex-network-deny.toml` | `deny = ["<host>"]` | `data did not match any variant of untagged enum FeatureToml` |

Both are now corrected against the published reference — the hooks file wraps its
events in `hooks`, the TOML uses `domains = { "<host>" = "deny" }` — and both were
verified by fetching <https://learn.chatgpt.com/docs/hooks> and the configuration
reference rather than by trusting the error message alone.

**Two corrections are mine, on top of Codex's, and they follow from its own evidence
rather than from its report.** The rejection is a strict-schema error, so:

- a **`_comment` key fails it too**. Adding the wrapper would have produced a second
  unloadable file. The commentary moved to `codex-hooks-template.md`, and the JSON
  now carries only `description` and `hooks`.
- **`matcher: "*"` is not a regex.** Codex's documented matchers are regular
  expressions (`"startup|resume"`), and `*` is not one. It is now `".*"`. Claude
  Code's own `"*"` is correct where it sits and wrong here. **Unverified** — it needs
  the same `/hooks` run.

**Why CI missed both.** The test searched the TOML for the production hostname and
found it **in a comment**. A grep cannot tell a key from prose, and the file had
plenty of prose. It now **parses** both files and checks them against the documented
schema; the parser throws on any construct it does not recognise rather than
skipping the line, because a parser that ignores what it cannot read would
reproduce the original fault more convincingly.

**What that test still cannot do**, stated so it is not over-read: it holds our
transcription to the schema *as documented today*. It would not catch a change on
Codex's side — which has already happened once, when `untrusted` was removed as an
approval value. Only the real loader catches that, and it runs on the Mac. **W35.**

### 8.2 W32 was the reverse of the truth

Withdrawn. The desktop app **does** support `PreToolUse`; our file could not load on
any surface, so the test that produced W32 could only ever have produced W32.

The method failure is the part worth keeping. `AGENTS.md` already requires a
reproduction to assert its preconditions — *"that the table really overflows"* — and
I asserted the restart, confirmed `pgrep` showed the app not running, and never
asserted that the configuration was valid. **A negative result from an instrument
that was never switched on measures nothing.** Worse, the previous write-up
congratulated the decision log for proving the hook *was never asked*; it proved
only that nothing was listening, which is a different fact with a different remedy.

This is the second time in two days that I have been right by luck and wrong by
method, and the first was the same instrument.

### 8.3 The gate is not a firewall, and three bypasses prove it

Codex ran four ordinary commands at the gate. **Two are now denied, one always was,
and one cannot be fixed by a mechanism of this kind.**

| Route | Before | Now |
|---|---|---|
| `curl https://<prod-ref>…` | denied | denied |
| `echo 'URL=https://<prod-ref>…' > .env.local` | **allowed** | denied — a redirect ends a segment's claim to be an inspection |
| `Write`/`Edit` into `.env.local` with the production URL | **allowed** | denied — a document describes production, an env file points at it |
| `source .env.local && npm run dev` | allowed | **still allowed, and recorded as such** |

The last one names no production identifier, so nothing that reads command text can
see it. It is asserted in `tests/productionGate.test.ts` **as an expected allow**,
which is the honest form: a test that documents a hole keeps it in front of whoever
reads the suite, where a missing test lets the next reader assume coverage.

**So the assurance label changes everywhere, and this is Codex's recommendation
adopted verbatim.** The gate is an **advisory identifier guard**: it denies an
*accidental, directly addressed* tool call, on both agents, and it does not withstand
prompt injection or a command that derives its destination at runtime. The phrase
"production is denied" has been removed from the gate's header, this document's
§4 table, and open item E27. **The boundaries are staging-only credentials, external
browser policy, and configuration the agent cannot edit (W34).**

### 8.4 The escalation path failed open on the agent that has the browser

On unparseable input the gate answered `permissionDecision: "ask"`. Codex's
documentation is explicit that `ask` is parsed for `PreToolUse` and **not
implemented**: Codex reports a hook error and **continues the tool call**. So the one
branch written to escalate rather than guess was, on Codex, the one branch that let
a malformed event through.

It now **denies** — the only decision both agents implement — and does it three ways
at once, because the two hosts read different signals: the `deny` JSON on stdout for
Claude Code, the reason on **stderr**, and **exit 2**, which both document as block.

### 8.5 The expected-change marker could be closed with a lie

`applied` was tested for being a non-empty string, so `applied: "yes"` closed a
marker and switched off the expiry rule — the only part of that mechanism that
escalates on its own. The dated fields shared one shape-only check, so
`expires: "2026-99-98"` was **a marker that could never expire**, written by a typo
rather than by intent: an impossible date is never in the past.

Closing now requires a real calendar date, not in the future, not before the
declaration. And the README has a **"What this does NOT yet do"** section, because
Codex was right that it read like a finished control: no 24-hour window, no immutable
production identifier, no approval identity beyond a free-text field, no rollback
reference, not consume-once — and it **explains** a change rather than permitting it,
which only helps if someone reads the nightly check (W31, not built).

### 8.6 The documents contradicted themselves, and the list was ambiguous

E27 (then E22) opened by correcting the claim that the Codex proxy reaches the
browser and closed, two sentences later, by calling it *"the only control in this
project that reaches the browser"*. The stale reason is deleted. **A correction that
leaves the old reason standing underneath is worse than no correction**, because the
row then supports whichever half the reader reaches first.

Then the structural half, which Codex did not look for and which is worse:
**this list was carrying six duplicated identifiers.** Today's additions were
numbered E21–E26 and W30 while an E21–E25 block and a W30 already existed, so `E24`
named both the Chrome path test and monitoring environment separation, and the day's
worklog cited the new numbers while the list answered with the old. Today's rows are
renumbered **E27–E31, W33–W35**.

Two of the six were worse than ambiguous: **both E21 rows were about the same
subject** — the required merge checks on `main` — one verified first-hand against
the live API and one not. That is the parallel-document failure §9 exists to prevent,
reproduced inside a single file. They are one row now.

`tests/openItemsIntegrity.test.ts` fails on a repeated identifier or a row with no
owner. Nobody scrolls 200 rows to check whether an identifier is free, which is
exactly why it needed a machine.

---

## 9. The test inventory, and what it does not cover

Every assertion that holds one of these controls in place, what it would catch, and
what it cannot. **Fail-first** records whether the test was watched failing against
the unfixed code, which `AGENTS.md` requires and which this project has twice
skipped and twice regretted.

| Suite | Cases | Holds | Fail-first |
|---|---:|---|---|
| `tests/productionGate.test.ts` | 23 | the gate's decisions, the audit commands it must not block, the two closed bypasses, and one open bypass asserted as an allow | yes — both closed bypasses watched failing with the rules neutralised |
| `tests/agentNetworkControls.test.ts` | 13 | the deny list names production and never staging; **both Codex files parse and match the documented schema** | yes — all four new assertions watched failing against the exact files Codex's loaders rejected, while the old grep test stayed green on them |
| `tests/expectedProductionChange.test.ts` | 16 | the marker's hash, expiry, and now that a closing value is a date that could have happened | yes — the three new cases watched failing against the pre-fix validator |
| `tests/openItemsIntegrity.test.ts` | 3 | one identifier per item, one owner per row | yes — watched failing on a reintroduced duplicate |
| `lib/migrationPasteParity.test.ts` | existing | a migration and its paste copy agree | pre-existing |
| `lib/serviceRoleGrants.test.ts` | existing | a `public` table created without a `service_role` grant fails by name | pre-existing |

Whole suite after the repairs: **137 files, 1571 tests, green** (`npm run verify:fast`,
3 October 16:07). Before: 136 / 1553.

### What no test here covers, and who can close it

| Not covered | Why no test reaches it | Closes with |
|---|---|---|
| Codex's **real** config loader | Codex is not installed in an agent container | W35, on the Mac |
| The hook **firing** on the desktop app | same, and it needs `/hooks` **trust** — a non-managed hook loads untrusted and does not run | the run in `codex-hooks-template.md` step 4 |
| `matcher: ".*"` and `statusMessage` | our correction, unverified | the same run |
| A command that derives its target at runtime | nothing in the call names production | staging-only credentials (W29) |
| A click in a logged-in dashboard | not a tool call; no hook sees it | E28, then E29 |
| Whether `URLBlocklist` survives `pushState` | needs a browser and the real dashboard | **E29 — still the single most informative five minutes on the list** |
| Anything an agent can edit about its own controls | the gate cannot tell its author from an attacker | **W34** |

**The honest summary of the position after two review rounds:** the mechanisms are
right and the labels were wrong. Nothing here stops an agent that is *trying*; what
it does is make an accident loud, a mistake reversible, and an unexplained production
change visible the next morning — once W31 exists. The sentence to put in front of
Fable is Codex's: *do not describe either agent as securely bounded while it retains
production credentials or a logged-in production browser session.*

---

## Appendix: the items this document cites

Added 3 October 2026 (evening) so the document can be read by a reviewer with no
repository access. Each is a row in [`../OPEN-ITEMS.md`](../OPEN-ITEMS.md), which is
the live list of everything outstanding, one named owner per row.

| Item | What it is | Owner |
|---|---|---|
| **E27** | Paste the Codex network deny onto the Mac. It bounds Codex's **shell commands only** — not the browser, which this document's §3 is about | Tasos |
| **E28** | **Remove platform-owner sessions from the agent's browser profile.** The top control: a logged-in production dashboard under a single owner account has no project-specific enforcement | Tasos |
| **E29** | **Fire one test: does Chrome's `URLBlocklist` survive `pushState` inside the Supabase dashboard?** Five minutes, and it decides whether the browser path is enforceable at all (§2) | Tasos |
| **E30** | One checkout per machine. A second one was 85 pull requests stale — no gate, no deny rules, governance files predating two of the project's own principles — and was the only path the agent trusted | Tasos |
| **E31** | An unattended autonomous loop was committing to this repository, on no list and in no worklog. The standing-authorisation problem in its purest form | Tasos |
| **W31** | Build the nightly production check on top of the expected-change marker (§5.4). **Nothing reads the marker until this exists** | Agent |
| **W32** | **Withdrawn — see §8.2.** It claimed the Codex desktop app does not invoke `hooks.json` | — |
| **W33** | Get this architecture independently designed and attacked before tiers 2–4 are built. **This document is that round** | Tasos to run, then Agent |
| **W34** | **Own the agents' configuration from outside the agents.** Root-owned managed settings, so an agent cannot widen its own permissions. All three reviews reached this independently | Tasos |
| **W35** | Validate the checked-in Codex configuration with **Codex's own loader**, not with a test that reads it. Both files were unloadable while CI was green (§8.1) | Tasos to run |
| **A02** | A published-terms/insurance mismatch found by checking the rendered page against the policies. Cited in §3 as the reason `anadyon.gr` is **not** on the deny list | closed |
| **F1** | Insurance, KTEO and odometer are not recorded against any vehicle, so the built stop-sell is inert. Unrelated to agent oversight; cited only as an example of a control that exists and does nothing | Tasos |

**Two project principles are cited by number.** Both are in
[`../../DEFINING-STATEMENTS.md`](../../DEFINING-STATEMENTS.md):

- **§8** — claims about the system are **verified, not assumed**; what cannot be
  checked is labelled unverified rather than filled in. Most of §9's second table is
  this rule applied to our own controls.
- **§9** — read what is already written before researching it again, and **extend the
  document that owns the subject** rather than writing a parallel one. §0's filename
  collision is a breach of it by both agents on the same day, and §8.6's duplicated
  identifiers are the same failure inside a single file.
- **§13** — a change to what the business charges, promises or requires needs the
  owner's explicit approval. Cited in §4 as the live example of a question no rule
  decides and a model might.
