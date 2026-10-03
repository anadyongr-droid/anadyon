# Reconciliation of three reviews of the agent-oversight design

**Last verified:** 3 October 2026, Claude.

Three independent passes: my design, an independent derivation by Fable from the
problem statement alone, and an adversarial pass by Codex. This is the merged
position, the disagreements resolved with reasons, and one finding none of the three
reached.

**Read the admissions first.** The two most useful outputs of this exercise were both
errors of mine that a reviewer caught, and one of them was the design's central
claim. They are recorded in §1 rather than buried, because a reconciliation that
reads as consensus hides what the review was for.

---

## 1. What the reviews changed, and what was simply wrong

| Finding | Found by | Verdict |
|---|---|---|
| **`[features.network_proxy]` does not reach the browser** | Codex | **I was wrong.** The claim was the design's centrepiece |
| **Tier 2's guardrail-file rule is circular** | Fable | **Correct.** A hook protecting the file that configures the hook |
| **A state diff is blind to a read of customer rows** | Fable | **Correct, and the worst of the three.** §1 named customer records as the asset |
| **Tier 3's merge-commit invariant would fire on every manual migration** | both | **Correct.** Resolved — see §4 |
| **The "Enforced" label on the Codex row was never fired** | Fable | **Correct.** Labelled from documentation, not from a test |
| **GitHub Pro for rulesets** | Fable | **Does not apply.** The repository is public; its own conditional was honest |
| **"No platform-enforced staging boundary" is too broad** | Fable | **Correct for tokens**, right for dashboard sessions. Supabase scoped tokens are project-limited |

**The browser error is worth dwelling on** because the mechanism recurs. It rested on
one sentence — *"browser tools separately check managed network denies"* — read as
*"browser tools also check network denies."* **"Separately"** means a different
mechanism; **"managed"** means the administrator-managed requirements file. Both
words were in the quotation, and both were read past. Verified wording:

> *"The network proxy only filters traffic from local commands that run inside the
> sandbox."*

And the design contradicted itself: §6 already said same-day detection of a browser
action did not exist, while §3 claimed the deny covered it. **The pessimistic half
was right.** That is the same shape as the insurance count corrected the day before —
prose in one section disagreeing with a statement in another, nothing checking. Twice
in two days makes it a pattern rather than an accident, and no test catches a document
contradicting itself. The control is review, which is what found it.

---

## 2. The reframing that matters most

Codex's opening line is the sharpest sentence any pass produced:

> *"Chrome access itself is workable; the unsafe part is permanent access to an owner
> session containing production."*

Every earlier attempt — mine, Fable's, Codex's own first pass — tried to constrain
**where the agent can go**. The governing variable is **how long the session lives**.
Signing in only for a supervised session and out afterwards converts *standing*
authorization into *session* authorization, and that is the change.

**It also withdraws an objection of mine.** I had written that "run browser tasks only
while watching" is not a control but a hope. That was right while the session was
permanent, because supervision was being asked to substitute for a boundary. Under
session-scoped sign-in it is not a substitute: it is the condition under which the
session exists. The control is coherent now in a way it was not when I dismissed it.

---

## 3. The finding none of the three reached: the browser is enforceable after all

All three passes concluded that P3 — a logged-in browser session against production —
has no project-specific enforcement, because production and staging dashboards are
**paths under one host** and host-level denies cannot split them.

**That is true of network controls and false of browser controls.** Chrome's
`URLBlocklist` enterprise policy matches on the full URL:

```
[scheme://][.]host[:port][/path][@query]
```

Paths are supported, and the documentation states that the filter with the **longest
matching path** wins. So this is expressible:

```
URLBlocklist:  supabase.com/dashboard/project/idfavwwfiuncoudkcfsp
URLAllowlist:  supabase.com/dashboard/project/fzycvstifmltxybffinq
```

**Why the three passes missed it.** Each of us reasoned about the *network* layer,
where the host is all that is visible because the path is inside TLS. Chrome evaluates
the URL **before the request leaves the browser**, so the path is in clear text to its
own policy engine. The discriminator was never unavailable; we were looking one layer
too low.

**It needs no TLS interception**, which is the reason to prefer it over the obvious
alternative. A man-in-the-middle proxy with a trusted CA *would* see paths everywhere
— and would be a universal decryption capability on the machine, reading every
credential in every session, installed to defend against a one-click mistake. That
trade is wrong for a single developer and it is not recommended.

### Three things to establish before relying on it

Recorded as unverified, not as details.

1. **The macOS install path.** The documentation found describes
   `/etc/opt/chrome/policies/managed`, which is Linux, and otherwise a configuration
   profile. On macOS the mechanism is a managed-preferences plist for
   `com.google.Chrome`; whether it applies without MDM enrolment is **untested**.
2. **Scope.** Chrome policy applies per user or per machine, **not per Chrome
   profile.** So blocking the production dashboard blocks it for the human too. The
   resolution is to give the agent a *different browser* — the agent on one Chromium
   build, production administration on another — which is arguably better than the
   control, because it forces production work into a deliberate, separate place.
3. **Single-page navigation.** The Supabase dashboard is an SPA. If a client-side
   route change via `pushState` does not trigger the blocklist, this catches direct
   URL entry and not a click on the project switcher. **This is the test that decides
   whether the control is real:** block the production path, open the staging
   dashboard, and click through to the production project from inside it.

Until (3) is fired, P3 remains **mitigated but unproven**, which is a different claim
from either "enforced" or "unmitigated", and it is the honest one.

---

## 4. Can an agent be the firewall?

Asked directly: an agent that approves "access staging" and denies "access
production".

**A firewall, yes. An agent as the firewall, no — and adding one would make it
worse.**

**Because the question is a string comparison.** "Does this URL contain the production
ref?" needs `===`, not a model. A model can be persuaded; an equality check cannot.
Putting a probabilistic component where a deterministic one is available trades a
guarantee for a judgement.

**Because prompt injection is risk 1 in this threat model.** An adjudicating model
reads request text that may be attacker-influenced and then decides. That adds a second
component susceptible to the attack being defended against, and grants it authority to
say yes. It does not compose into depth; it adds latency and the appearance of depth.

### The composition rule that makes a model safe to add

> **A model may only ever narrow, never widen.** It may deny, or escalate to the
> human. It must never be able to approve what the deterministic layer denied.

Under that rule a model is a useful *extra* gate and never the granting one.

**Where a model genuinely earns its place** is a question no rule decides. The live
example is `DEFINING-STATEMENTS.md` §13: *could a customer receive different terms,
price, cover, expectation or treatment?* That is judgement, it is exactly what §13
requires before a merge, and a model reviewing a diff against it adds something a
pattern cannot. It escalates; it does not approve.

### The deterministic firewall, by layer, and what each can see

| Layer | Sees | Can it split production from staging? |
|---|---|---|
| Permission rules (`WebFetch(domain:…)`, `Bash(…)`) | tool call text | Host yes; the Bash half is advisory |
| Local forward proxy | the `CONNECT` **host** only — the path is inside TLS | **No** for same-host dashboards |
| **Chrome `URLBlocklist`** | **the full URL, path included** | **Yes** — §3 |
| TLS-intercepting proxy | everything | Yes, at the cost of universal decryption. **Not recommended** |
| Scoped Supabase token / dedicated Postgres role | the credential's own reach | **Yes, and it is the strongest** |
| `pgaudit` by role | every statement, including reads | Detection rather than prevention — §5 |

**The conclusion from the table:** the firewall already exists in pieces and none of
them is an agent. What was missing was the browser row, and it was missing because
nobody looked at the browser's own policy engine.

---

## 5. Can an agent implement all of this?

Largely no, and the reason is structural rather than practical:

> **The controls an agent can install are exactly the controls an agent can
> uninstall.**

Root-owned configuration, a browser policy under `/Library`, a dashboard setting, a
`sudo`, a paste into the SQL editor — each sits outside agent reach, and that is what
makes it a control rather than a reminder. An agent able to put them in place could
take them out, which is Fable's circularity finding generalised.

**What an agent can properly do, and should:**

- **Generate the exact artifact** to be installed — the plist, the TOML, the
  migration plus its paste copy — so the human's step is a paste, not a design.
- **Build the verifier**, and put it where the agent cannot reach it. A test in CI
  that fails when a deny list loses the production ref is enforcement the agent
  cannot undo, because it runs on a machine the agent has no credential for.
- **Fire the controls and record what happened**, which is what distinguishes a label
  from a claim. Tier 1's differential — production blocked, staging still 401, the
  audit grep still working — is the pattern.

That division is the answer: **the agent builds the instrument; the human installs the
boundary.**

---

## 6. The merged design

### Immediate, and it is the whole of P3's mitigation

1. **Session-scoped sign-in.** Sign the agent's browser into platform accounts only
   for a supervised session; sign out after. No email, banking or personal accounts in
   that profile.
2. **A separate browser for the agent**, with the ChatGPT extension installed only
   there and **removed from the main profile** — per-profile installation is what makes
   that enforcement rather than a reminder.
3. **Chrome `URLBlocklist` on the production dashboard path** in the agent's browser,
   after firing test (3) in §3.
4. **Per-turn site approval**: *Allow once*, never *Allow for all sites*; no CDP;
   downloads and uploads denied unless the task needs them.
5. **The ref is checked by the human at the approval prompt**, not promised by the
   agent. Codex's URL-check rule is good and it is **advisory** where the agent makes
   it and **enforced** where the person does.
6. **Built-in browser by default**; the authenticated browser only when a dashboard
   session is genuinely required.

### Credentials

7. **Scoped Supabase token**, project-limited to staging, for CLI and MCP. Inventory
   and revoke the account-wide tokens currently on the machine — `supabase login`
   creates a full-account one.
8. **`read_only` protects integrity, not confidentiality.** A read-only token over
   production still reads customer rows, which is what §6 exists to prevent.
9. **GitHub: the token split Codex proposed is not possible.** Merging a pull request
   requires `contents: write`, the same permission as pushing, and GitHub has an open
   request to separate them. **Branch protection is the lever, not token scope** — and
   `main`'s required check carries `enforcement_level: "everyone"`, so even the owner
   cannot merge with `build` red. Required reviews are zero, proved by merging #195
   unreviewed. **That gap is the one worth closing.**

### Record and detection

10. **Root-owned managed configuration** for both agents, so the guardrail-file rule
    stops being circular.
11. **Root pulls the transcripts; the agent does not push them.** This is Fable's
    resolution of Q1 and Q2 together: privilege separation means the agent cannot read
    the collector's credential, and asynchronous copying removes the fail-open versus
    fail-closed question entirely.
12. **`pgaudit` on the production role, with the read class** — the only thing that
    sees a read of customer rows. **Load-bearing and unverified: which Postgres role
    the dashboard's table editor runs as.** If it is not the audited role, this misses
    dashboard activity, which is the whole point.
13. **Nightly, not every ten minutes.** The response is manual; nobody acts in fifteen
    minutes while asleep. High frequency burns Actions minutes, GitHub's schedules are
    best-effort and skip under load, and the likeliest outcome of a noisy monitor is
    that it gets switched off. **Nightly, a manual trigger, and a heartbeat.**
14. **A heartbeat, because nothing else distinguishes "clean" from "stopped."** A
    silent check looks exactly like a quiet day. Free, and it should be done regardless
    of everything else here.
15. **The expected-production-change marker** — built, `supabase/expected-changes/`.
    Declared before the paste, hashed against the file, expiring so an unapplied
    declaration escalates itself.

### Keep from the original design

16. The `Read(./.env*)` deny, which `AGENTS.md` identifies as the one entry in that
    file that is a real boundary.
17. The checked-in test holding deny lists to the boundary module, which Fable
    recommended generalising as the answer to Q4.
18. `PostToolUseFailure` as the single best signal for a daily verdict — what the agent
    *tried* and was refused.

### Explicitly not adopted

- **Denying `anadyon.gr`.** It is the public website. Verifying a published claim
  against a rendered page is what §8 and §10 require and what caught A02, the
  highest-severity finding in the audit. Denying it removes the check, not the risk.
- **A TLS-intercepting proxy.** §4.
- **An adjudicating agent in the grant path.** §4.
- **Supabase Team** for project-scoped roles. Scoped tokens achieve the credential
  half free, and the dashboard half is answered by §3 and by having no standing
  session.

---

## 7. What remains unverified, and each blocks something

| Unknown | Blocks | Test |
|---|---|---|
| Does `pushState` navigation bypass `URLBlocklist`? | whether P3 is enforced at all | Block the production path, open staging, click through to production |
| The macOS managed-policy install path, without MDM | the same | Install it and load the blocked URL |
| Which Postgres role the dashboard table editor uses | `pgaudit` covering the browser path | `select current_user` from the dashboard SQL editor |
| Does the Codex desktop app read **any** `~/.codex` policy file? | root-owned browser policy, and any agent-side gate on Codex | **ANSWERED 3 October, and the first answer here was wrong: it does load `hooks.json`.** This row said it did not, on the strength of a restart, a 401, and an empty decision log. The file was invalid — event names at the top level — so nothing loaded it on any surface and the measurement was vacuous. Codex queried the app's own hook inventory: zero hooks as shipped, gate found and enabled with the `hooks` wrapper. W32 is withdrawn; see CONSOLIDATED section 8.2. `requirements.toml` is still open |
| `browser_use.origins` — named by Codex, absent from the permissions page read here | origin-level blocking | Find it in the config schema or drop the claim |
| Supabase scoped-token plan requirement | the credential half | Create one |

**None of these is a detail.** The first decides whether the central finding of this
reconciliation is real, and until it is fired the honest statement is **"mitigated,
unproven"**.

---

## 8. Order

1. **Sign out, separate browser, extension removed from the main profile.** Free,
   immediate, and the largest single reduction available. *Tasos.*
2. **Fire the `pushState` test.** It decides whether §3 holds. *Tasos, five minutes.*
3. **Heartbeat.** Free, and distinguishes clean from stopped. *Agent.*
4. **Scoped Supabase token; inventory and revoke the account-wide ones.** *Tasos.*
5. **The restore drill** — never once performed, and the backup's only check lists an
   archive rather than loading it. *Tasos.*
6. **Require a review on `main`**, the one branch-protection gap. *Tasos.*
7. **`pgaudit`**, after the role question. Migration plus paste copy, carrying the
   first expected-change marker. *Agent writes, Tasos applies.*
8. **The nightly check**, reading the audit log and the marker. *Agent.*
9. **Root-owned configuration and root-pulled transcripts.** *Tasos for the install.*
