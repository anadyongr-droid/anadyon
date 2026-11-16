# Proposal for Fable: subscription-only autonomous Claude Code / Codex collaboration

**Date:** 15 November 2026  
**Status:** Proposal for independent review; not an authorised implementation.  
**Approval:** Owner must approve every merge and every deployment separately.  
**Cost:** Zero incremental spend. Existing subscriptions and existing free allowances only.

## 1. Purpose and boundaries

Enable Claude Code and Codex to collaborate on Anadyon's development in isolated workspaces, using the existing blueprint and open-items queue, exchanging durable handovers, switching implementer/reviewer roles, testing independently, and preparing draft pull requests. No autonomous merge, production deployment, staging schema reset, live data operation, paid API usage, or governance relaxation. This proposal is not permission to modify the operating model.

Fable: challenge this proposal against **the entire current repository**, including `AGENTS.md`, `CLAUDE.md`, `DEFINING-STATEMENTS.md`, `docs/README.md`, `docs/OPEN-ITEMS.md`, `docs/WORKLOG.md`, `docs/agent-controls/OPERATOR-SETUP.md`, `docs/STAGING-AND-OBSERVABILITY-RUNBOOK.md`, `docs/ENGINEERING-SAFETY-NET.md`, CI and existing enforcement tests. Cite exact file locations, distinguish live verification from documentation, and do not duplicate settled work.

## 2. Existing rules: preserve, don't replace

- §8 already requires verification rather than assumption. Extend with machine-checkable evidence requirements; do not create a contradictory second truth principle.
- §9 requires subject-based discovery and updating the canonical document, not parallel research.
- §11 requires every agent's daily written findings, with Claude consolidating; §12 requires reading and maintaining OPEN-ITEMS daily, with owners.
- §13 requires owner approval for any change affecting pricing, insurance, customer communications, staff authority or the operating model.
- AGENTS.md defines Architect/Implementer rotation, durable version-controlled handovers, regression tests, fail-first evidence, immutable migration/paste copies, and the existing no-agent-migration-execution rule.
- Preserve existing production-deny mechanisms, root-owned managed gate, separate staging Supabase, production fingerprint, and CI safeguards. Verify their actual current state before claiming protection.
- **New stricter owner instruction supersedes permissive autonomous-merge language:** ALL merges and ALL deployments, including staging, require explicit owner approval, tied to exact head SHA and environment. Draft PR creation and local test execution do not.

## 3. Proposed new binding additions (draft, not yet adopted)

### §14 — Mandatory context/usage handover and role rotation

Before an agent approaches a reported context or usage limit, it must checkpoint, commit safe verified increments, document open work, and write a structured handover to the other agent. The receiver acknowledges the handover and takes the next appropriate Implementer or Reviewer role. A reviewer must not self-review the exact change they implemented. Every role transition is recorded. Do not invent usage percentages: where remaining allowance is not exposed, use conservative session-duration/turn checkpoints and stop safely on actual exhaustion. If both providers are unavailable, pause and resume when subscription capacity returns. No exception, no paid fallback, no silent abandonment.

### §15 — Strict no-incremental-spend boundary

Authorised additional cost = EUR 0. No API keys billed per token, usage-based inference, paid orchestration, automatic top-ups, paid third-party services, extra seats, or new metered hosting. Existing included GitHub/Vercel/Supabase quotas may be used only where usage can be bounded without charges. Verify provider terms and whether unattended CLI use under the user's existing subscriptions is supported; do not assume that a ChatGPT or Claude consumer subscription can be used as a background API credential. If unsupported, pause; propose a subscription-compliant assisted workflow, not a workaround. Prevent charges via billing-level limits where available; warnings alone do not enforce zero cost.

### §16 — Daily independently evidenced owner report and approvals

Produce a plain-English report each active day, including zero-progress days. Include task-by-task outcomes, exact commit/PR links, role assignments and handovers, test counts and failed/skipped/cancelled checks, staging and production activity, costs/allowances where observable, all governance exceptions and unverified controls, blockers, next steps and separate owner decisions requested for each merge and deployment. Each compliance claim cites evidence; 'not verified' is not 'passed'. Agent-produced summaries are cross-checked by an independent collector against GitHub logs, checks and deployment metadata. No report = no approval eligibility. Reports must not contain secrets or personal customer data.

### §17 — Evidence discipline and fail-closed governance

Apply existing §8 to every statement: classify **verified observation**, **inference**, **proposal** or **unverified**. Claims of CI success, completed tests, approval, schema parity, staging isolation, production non-access and zero additional spend require independent evidence. Missing, skipped, cancelled or stale required checks block the next action. Neither agent may edit its own enforcement, approval records, policy runner or credential boundary. Policy changes require owner approval and protected, non-agent-controlled enforcement. Evidence is linked to exact immutable SHA and timestamp. Audit logs are append-only from the agents' perspective.

### §18 — Owner-only merges and deployments

No agent or coordinator may merge any branch or trigger any deployment (including staging) without explicit owner approval for the exact PR/head SHA and target environment. Approval to merge does not approve deployment; staging approval does not approve production. A changed SHA invalidates approval. Do not allow automated Vercel previews to bypass this rule: audit existing Git-connected preview behaviour and either constrain it or explicitly obtain a separate owner-approved standing policy for non-sensitive previews. Existing GitHub auto-merge must remain off. Approval mechanism must be enforced outside agent-editable files.

## 4. Proposed orchestrator design

Coordinator maintains a durable state machine: BACKLOG → ARCHITECT_SCOPE → IMPLEMENT → REVIEW → FIX (maximum 3 cycles) → VERIFIED → OWNER_APPROVAL_PENDING → MERGE_APPROVED / DEPLOY_APPROVED. A PAUSED or BLOCKED state is available at every step. It selects only explicitly eligible work, one staging integration task at a time; serialises staging E2E without GitHub pending-run cancellation; and never treats missing checks as green.

Agent identities are scoped to branches and non-production test facilities. Production credentials, browser sessions, Supabase SQL consoles and deployment credentials are unavailable. Coordinator/policy configuration is owned by a separate account or protected service outside agent write scope. The runner must not expose tokens that permit bypassing owner approval.

Handover schema: task ID, source SHA, current role, goal and exclusions, blueprint references, files changed, tests actually executed with outputs, confirmed facts and sources, unresolved questions, defects, next exact step, estimated context/usage if truly observable, acknowledgement by receiver. Roles may alternate, but reviewer independence is per change, not merely per turn.

## 5. Read-only audit before build

1. Re-check effective GitHub rulesets, required status checks, approvals, bypass actors, CODEOWNERS and workflow permissions; confirm no merge path exists for the runner.
2. Re-check actual recent CI runs and steps, particularly schema-drift warnings, staging E2E skips/cancellations and concurrency queue issue E11. Confirm tests run against intended SHA and database.
3. Inspect Vercel project/branch/environment scopes, preview auto-deploy behaviour, protection, production aliases, and email redirect configuration. Do not expose secret values.
4. Inspect Supabase production and staging project metadata, role permissions, RLS/security advisors, migration state and staging reset boundaries using read-only methods. Do not execute SQL that writes.
5. Verify managed production gate installation/ownership and browser-profile separation; connector read-only visibility may be insufficient, in which case provide exact user-run verification instructions.
6. Verify provider subscription/CLI/automation terms and zero-spend feasibility before implementing unattended agents. Avoid any metered inference tests.
7. Reconcile open items, blueprint, latest PRs, worklogs and canonical docs; document confirmed versus pending.
8. Test enforcement with simulated forbidden actions in a disposable environment, never production.

## 6. Pilot and acceptance criteria

Start with 3 low-risk tasks, no schema migration application, no customer-facing policy changes, no live communications, no paid API. Demonstrate mandatory handover, independent review, exact-SHA approval expiry, cancelled/missing CI fail-closed, policy-file tamper denial, no production credentials, and zero incremental charges. Capture the evidence in the daily report. Stop on any failed negative test. Only after explicit owner approval may the implementation expand.

## 7. Daily report template

**Date and coverage** (timezone Europe/Luxembourg, report creation time, sources and missing evidence)

**Executive summary:** completed / in progress / blocked / waiting for owner, concise.

**Work ledger:** task, why selected, agent roles, handovers, commits/PRs, changed behaviour, next step.

**Checks:** test names, passed/failed/skipped/cancelled, actual job URLs and SHA, staging environment state.

**Governance audit:** each applicable defining principle, evidence, status PASS / FAIL / UNVERIFIED / NOT APPLICABLE; explicit §13 customer impact assessment.

**Security and cost:** production-access attempts/denials, secret exposure checks, staging email isolation, observed incremental charges (if billing is not accessible say UNVERIFIED), provider subscription limits and pauses.

**Decisions:** each exact PR/SHA separately: APPROVE MERGE / REQUEST CHANGES / DEFER; each environment deployment separately: APPROVE DEPLOY / DEFER. No inferred approval.

**Risks and next day:** ranked blockers, owners, dates and safe continuation checkpoint.

## 8. Specific questions for Fable

1. Which requirements are already implemented and actively enforced, versus only documented?
2. Are §14–18 consistent with all 13 current principles and AGENTS.md? Propose the smallest edits and tests.
3. What is the safest zero-extra-cost, subscription-compliant mechanism for unattended handovers, and what is not technically possible?
4. How can we prevent a token-limit handover from losing review independence or causing endless ping-pong?
5. How can owner-only merge and staging-deploy approval be enforced given automatic Vercel Git previews?
6. How do we protect policy enforcement from edits by either agent, especially CI workflows and hooks?
7. What minimum read-only verification is still required and what would block a pilot?
8. Where would the design waste context/tokens, and how can it be simplified without weakening controls?
9. What should be done before the user's temporary free Fable allowance expires, without paid fallback?

**Review request:** Return a severity-ranked critique, evidence-linked gap matrix, minimum viable architecture, precise proposed edits/tests, subscription feasibility verdict, and an explicit 'do not build yet' list. Do not implement or merge as part of the review.
