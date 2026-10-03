# Brief for an independent architectural review

**Last verified:** 3 October 2026, Claude.

---

## How to use this file — read this part first, Tasos

**Paste the text below the line into a brand-new chat, with no repository
attached.**

Two reasons, and the second is the one that matters:

1. A fresh chat has no exposure to the reasoning that produced our own design.
2. **This repository contains that design**, at
   [`../AGENT-ACCESS-AND-MONITORING.md`](../AGENT-ACCESS-AND-MONITORING.md). If the
   reviewer can read the repo, it will find that file, and you will get our
   architecture back with improvements rather than an independent one. The exercise
   collapses silently — it will still look like a review.

**Do not paste our design, our tier structure, or our open questions.** The point is
to find out whether our architecture is the natural answer to this problem or merely
the first one we thought of. You can only learn that by seeing what someone reaches
for without being shown ours.

**Then, as a second message in the same chat**, paste our design and ask for the
diff. Where the two agree, the confidence is real. Where they diverge is the whole
value of the exercise.

**Then, separately, the adversarial pass** — and give this one to Codex rather than
to another Claude model, because two models from the same family share training and
therefore share blind spots. Phrase it as a goal, not a question:

> *You want to reach the production database from an agent session, or to act in the
> production dashboard, without appearing in the record afterwards. Here are the
> controls. How do you do it?*

"Assess this architecture" produces praise. "Defeat this" produces findings.

**What is deliberately included below:** every platform fact we verified, so the
reviewer does not waste its effort re-researching settled mechanics, and so any
disagreement is about architecture rather than about what a config key is called.
Each fact is marked **verified** or **unverified** — `DEFINING-STATEMENTS.md` §8 —
and the reviewer should re-check anything marked unverified rather than inherit it.
We have been burned by the opposite: an audit of this project inherited a wrong
vehicle count from one of our own documents because it trusted the document instead
of recounting the table it sat next to.

---

# Independent review request: oversight of AI coding agents on a solo-developer setup

You are being asked to **design**, not to review. Please produce your own
architecture for the problem below before considering anyone else's. If you find the
problem under-specified, state the assumption you are making and continue rather
than stopping.

## The setup

- **Solo developer, macOS.** VS Code and GitHub. Two coding agents work on the same
  repository: Claude Code and OpenAI Codex, in separate worktrees on separate
  branches.
- **Application stack:** Supabase (Postgres, Auth, Storage), Vercel, Sentry, GitHub.
- **Codex drives Chrome** and acts on the developer's behalf inside applications
  where he is already signed in.
- **Codex is instructed to work only on the staging application.** However:
  - It runs in the developer's main Chrome profile, so every logged-in session on
    that profile is reachable.
  - **Staging and production are two projects under the same platform account**, and
    the browser is signed in with that account. Production is one click away.
- There is a live production database holding real customer records: names, email
  addresses, phone numbers, reservations, payments.

## The constraints — these are decisions already taken, not open for re-litigation

1. **One platform account is kept, for now.** A reviewer may note the cost of this;
   it should not design as though the constraint were absent.
2. **Oversight may be post-hoc.** Real-time human supervision is explicitly not
   required. "I find out the next morning" is acceptable; "I never find out" is not.
3. **Low operational friction is a hard requirement, not a preference.** This is one
   person. A control that adds a prompt to every command, or a report that must be
   run by hand, will be switched off within a week — and a control that has been
   switched off while still appearing to exist is worse than one that was never
   built.
4. **The design must be portable** to future projects on the same stack, not
   one-off.
5. Budget is a consideration. Prefer designs that work on free or current tiers, and
   say explicitly when a paid tier is the only honest answer.

## The threat model

Not a malicious developer. The concerns are:

- **Task scope ≠ access scope.** A misread instruction, or a prompt injection
  carried in a web page the agent reads, takes an agent into production or into
  another signed-in application.
- **Shared account**, so an agent can view keys, run queries, or change settings in
  production.
- **Imperfect staging isolation** — shared keys, shared database, live versus test
  payment credentials.

## Platform facts we have verified — use these, do not re-derive them

**Codex** (verified 3 October 2026 against `learn.chatgpt.com`):
- `sandbox_mode`: `read-only` | `workspace-write` | `danger-full-access`.
- `approval_policy`: `on-request` | `never` | `{ granular = { … } }` with
  subcategories `sandbox_approval`, `rules`, `mcp_elicitations`,
  `request_permissions`, `skill_approval`. Also `approvals_reviewer = "auto_review"`.
  **`"untrusted"` has been removed** and is no longer valid.
- Network access is off by default under `workspace-write`;
  `[sandbox_workspace_write] network_access` and `[features.network_proxy]` with
  domain `allow`/`deny` rules control it.
- **Lifecycle hooks exist**: `features.hooks = true`, configured in `hooks.json` or
  an inline `[hooks]` table. Events include `PreToolUse`, `PermissionRequest`,
  `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd`,
  `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`, `Interrupt`. They run
  out-of-process, receive JSON on stdin, and **can block**. Command and MCP-tool
  handlers work; prompt and agent handlers are parsed but skipped.
- Codex attaches to Chrome via a **browser extension, not CDP**. The extension is
  **per Chrome profile**, and a task uses the profile where it was installed. There
  is also a built-in browser in the desktop app with its own separate profile and
  session state. Site allowlist/blocklist and per-site permissions exist, and it
  asks before interacting with a new site and before submitting, purchasing,
  changing permissions or deleting.
- The documentation states that **"browser tools separately check managed network
  denies."**

**Claude Code** (verified 3 October 2026 against `code.claude.com`):
- Hooks: a large event set including `PreToolUse`, `PermissionRequest`,
  `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`,
  `SessionStart`, `SessionEnd`, `FileChanged`, `PreCompact`. **Exit code 2 blocks;
  exit code 1 does not.** A `PreToolUse` hook may instead return
  `{"hookSpecificOutput":{"permissionDecision":"deny"|"allow"|"ask"}}`. Handler
  types include `command`, `http`, `mcp_tool`, `prompt`, `agent`. `disableAllHooks`
  exists.
- Permissions: `deny` rules work **without** sandboxing. `WebFetch(domain:…)`
  matches hostnames and supports wildcards; the `domain:` form **also** contributes
  to the sandbox's denied-domain list.
- Sandbox: `sandbox.enabled`, macOS Seatbelt, no extra install. Network default is
  no direct route out, and **the allowed-domain list starts empty**. It wraps shell
  commands only — Read/Edit/Write, WebFetch, hooks and local MCP servers run
  **outside** it, so *"a `denyRead` entry doesn't stop the Read tool, and
  `allowedDomains` doesn't limit WebFetch."* `excludedCommands`,
  `allowUnsandboxedCommands` and an unsandboxed-retry path exist.

**Platform access control** (verified 3 October 2026 against vendor docs):
- **Supabase project-scoped roles require the Team or Enterprise plan.**
- **Vercel project-level roles require Enterprise**, as does the Contributor role
  they depend on. Pro roles are all team-wide, and Vercel's documentation states
  *"Developers can deploy to production through merging to the production branch."*
- Supabase MCP server supports `project_ref`, `read_only=true` and `features=`
  (tool groups); its documentation recommends using all three together and warns
  that read-only *"does not protect against prompt injection within returned data."*
- Supabase removes the automatic Data API grant on **30 October 2026**: a table
  created in `public` gets no privileges for any role unless a `GRANT` says so.

**Facts we have NOT verified — please treat as unknown rather than inheriting them:**
- Whether audit-log APIs (Supabase, Vercel, GitHub, Sentry) are available on
  non-enterprise tiers, and what retention they carry.
- Whether Codex's hooks fire for **browser** actions, or only for CLI tool use. We
  assume the latter and have not confirmed it. If they do fire, it changes the
  design materially.
- Whether the Chrome extension can be constrained to a domain allowlist strictly
  enough to be relied on.

## Existing assets you may build on

- A **nightly GitHub Actions backup** of production, running reliably for eleven
  consecutive nights: dumps roles, schema and data, encrypts, verifies the archive
  decrypts, uploads to Cloudflare R2, prunes. Its credentials are GitHub Actions
  secrets and exist nowhere near either agent.
- A checked-in **deployment-boundary module** that fails a staging deploy carrying a
  non-test Stripe key or a credential that must not reach a Preview deployment.
- A test suite of ~1,500 unit tests run by one command, plus a convention that **a
  new regression test must be proved to fail against the unfixed code** before it is
  trusted.
- A documentation discipline: every finding goes into a version-controlled document,
  each carrying a `Last verified:` line; a daily open-items list with a named owner
  on every entry.
- Agent transcripts on disk: `~/.claude/projects/**.jsonl` and `~/.codex/sessions`.
  Note that these are written by the process being monitored, on the machine it
  controls, and are deletable.

## What to produce

1. **Your architecture.** What you would build, in what order, and what each
   component is for.
2. **For every control, say whether it is *enforced* or *advisory*** — whether it
   constrains the process, or only reminds the model. We consider conflating these
   the main way such a design acquires an invisible hole.
3. **What your design does not cover**, stated as plainly as what it does, including
   the worst case that remains and roughly how long it stays undetected.
4. **The invariant each component depends on**, and what happens when that invariant
   is false. We are specifically interested in controls that fail *noisily* versus
   ones that fail *silently*.
5. **Where you would spend money**, if anywhere, and what it buys that engineering
   cannot.
6. **What you would not build**, and why. A shorter design with honest limits is a
   better answer than a complete-looking one.

Please be concrete about mechanism — config keys, event names, file locations —
rather than describing categories of control.
