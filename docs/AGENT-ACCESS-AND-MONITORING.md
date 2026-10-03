# Agent access and monitoring

**Last verified:** 3 October 2026, Codex, against the current repository and the
official Codex, Claude Code, Supabase, Vercel, Stripe, GitHub and Sentry
documentation linked in §13.

**Status:** design complete for review. Nothing in this document has been built
by this branch. Implementation is open item W31.

## 1. Decision

Build an **Anadyon Agent Guardian**, but do not make another AI agent the
security boundary. The authority-bearing parts are deterministic:

1. a checked-in policy describing the allowed staging targets and protected
   production targets;
2. adapters for Claude Code and Codex that apply that policy before supported
   local tools run;
3. a local session sentinel that records and classifies what the agents and
   Chrome appear to have touched;
4. an independent production watcher running outside the Mac;
5. a short-lived expected-change record for legitimate manual production work;
6. concise Telegram alerts and an explicit monitor heartbeat.

An optional AI summariser may explain an alert after the deterministic checks
have assigned its severity. It may not downgrade or suppress an alert, mutate
the policy or take remedial action.

This design keeps Codex able to use the signed-in Chrome profile, as Tasos
requested. It does not claim that this is a fully isolated arrangement. With
staging and production under the same platform account, a browser session that
can reach staging can reach production on the same dashboard origin. The
guardian reduces mistakes, records evidence and detects resulting production
changes; it cannot turn one owner session into a project-scoped identity.

## 2. What exists today

The following repository controls are real and should be reused:

- `scripts/deployment-boundary-lib.mjs` knows staging Supabase project
  `fzycvstifmltxybffinq`, prevents production-only secrets from entering a
  Preview deployment and rejects a non-test Stripe secret on staging.
- `.github/workflows/backup.yml` already creates an encrypted off-machine
  production database backup in GitHub Actions and uploads it to R2. It is the
  right execution boundary for production-state checks because its credentials
  do not need to exist in an agent session.
- `.claude/settings.json` denies Claude Code's `Read` tool access to `.env*` and
  contains command reminders for destructive operations.
- Git history, CI and the shared documents provide a durable record of intended
  changes.

The following do **not** exist on `main` at the basis commit `c4fcb01`, and must
not be described as built:

- no checked-in Codex hook or browser-origin policy;
- no shared Claude/Codex guardian policy;
- no `agent_watch.py` or equivalent local sentinel;
- no off-machine production fingerprint comparison;
- no expected-change record format.

`.claude/settings.json` is a Claude Code configuration file. It does not apply
to Codex. Its broad `Bash(git push*)` allow entry also means it must not be
treated as a production boundary.

## 3. Threat model

The asset is the production service: customer data, reservations, payments,
statutory filings, production configuration and the public deployment.

The primary threat is **task scope differing from access scope**. An agent asked
to operate on staging can reach more than staging because it runs under Tasos's
local identity and signed-in sessions. The design covers mistakes, ambiguous
instructions and prompt injection from content an agent reads. It also makes
guardrail failure visible.

| Path | Example | Prevented? | Detected? |
|---|---|---:|---:|
| P1 — local command | `psql`, `curl`, Supabase CLI or Vercel CLI targets production | Partly | Yes |
| P2 — local agent tool | an MCP or file tool changes a protected target | Partly | Yes |
| P3 — hosted tool | web search, connector or another hosted tool reaches outside the local sandbox | Separately controlled | Partly |
| P4 — signed-in Chrome | an agent opens the production project and saves a setting or deletes data | No reliable project-level prevention under the current account | Yes, subject to §8 limits |
| P5 — guardrail tampering | an agent edits or disables its own policy, hook or scanner | Partly | Yes |
| P6 — monitor silence | a collector loses credentials, stops running or cannot send its alert | No | Yes, through heartbeat/failure state |

The operator is trusted. A fully compromised Mac or a malicious person with the
owner account is outside scope. The off-machine watcher is designed to survive
a local agent or laptop failure, not to defeat the platform owner.

## 4. One policy, two adapters

The source of truth will be a versioned, secret-free policy file in the
repository. Claude Code and Codex need separate adapters because their hook and
permission formats differ, but both adapters must consume the same policy and
the same test fixtures.

The policy contains:

- immutable staging and production project IDs, organization/team IDs and
  repository IDs;
- approved staging hosts and aliases;
- protected branches and production deployment targets;
- production-only and staging-only environment-variable names;
- exact high-confidence forbidden operations;
- detection-only patterns with severity and rationale;
- paths containing the policy, hook configuration and monitor state;
- a policy schema version and expiry date for vendor assumptions.

The current immutable Supabase refs are:

| Environment | Project ref |
|---|---|
| Staging | `fzycvstifmltxybffinq` |
| Production | `idfavwwfiuncoudkcfsp` |

Before implementation, the Vercel project ID, Sentry organization/project IDs,
Stripe general-sandbox ID and GitHub repository ID must be recorded from safe
metadata. Names and URLs are useful evidence but are not immutable identifiers.

Every policy change is a reviewed repository diff. Local adapters compare their
embedded schema version and policy digest at session start. A mismatch produces
a red control-health event; it never silently falls back to an older policy.

## 5. Local enforcement adapters

### 5.1 Codex

Codex currently supports `PreToolUse`, `PostToolUse`, `PermissionRequest`,
session and prompt lifecycle hooks. `PreToolUse` can deny supported shell,
`apply_patch`, MCP and other local function calls. Hosted tools such as web
search do not use that hook path, and specialised paths may opt out. The adapter
therefore covers only the tool paths the runtime documents and proves in tests.

The Codex adapter will:

- deny exact production-targeted mutations from supported local tools;
- deny writes to the guardian policy, hook configuration and local monitor
  state during an ordinary project session;
- log the decision, policy version, tool class, redacted target and outcome;
- leave ordinary read-only repository work alone;
- treat hook failure as a control-health event, never as proof that the tool was
  checked.

Codex permission profiles and the network proxy constrain sandboxed local
commands only. They do not constrain Browser Use, Computer Use, web search,
apps/connectors, MCP transports or Codex cloud. Those surfaces retain their own
controls.

### 5.2 Claude Code

Claude Code's `PreToolUse` hook can see its built-in tools, web tools and MCP
tools and can deny a call before it runs. Its sandbox network allowlist applies
to sandboxed commands; in-process tools such as `WebFetch` continue to follow
their permission rules. The Claude adapter will apply the same policy and emit
the same event schema as the Codex adapter.

The existing `.env*` Read denies remain. During implementation the broad
`Bash(git push*)` allow must be narrowed so a convenience rule does not bypass
the project's production-sign-off requirement.

### 5.3 Block and failure rules

Only high-confidence rules block. Examples are an exact production project ref
in a known mutation command, `vercel --prod`, force-pushing a protected branch,
or writing the guardian configuration from an ordinary agent session. Vague
text matches such as the word `production` are alert-only because documentation,
tests and audits legitimately contain them.

For a high-confidence rule, parsing failure is fail-closed for that tool call.
For event delivery failure, local development remains usable but the adapter
writes a restricted local spool and marks control health red. The spool is a
reliability buffer, not tamper-proof evidence. It is flushed later and sequence
gaps remain visible.

## 6. Browser operating model

Chrome remains available. The controls are:

- site access lasts one turn;
- persistent `Always allow` approvals are disabled;
- automatic review is disabled, so a person sees approval prompts;
- uploads, downloads and full Chrome DevTools Protocol access are denied by
  default and opened only for a specific task;
- authenticated dashboard tasks run only while Tasos is present;
- before any dashboard mutation, the agent states the platform, project name,
  immutable project ID where visible and environment in the approval request;
- the session sentinel records dashboard visits, while the production watcher
  checks the resulting state.

Codex browser-origin rules match scheme and host, not paths or query strings.
They can block `https://supabase.com` or `https://vercel.com`, but they cannot
allow a staging project path while denying a production project path on the
same origin. A dedicated Chrome profile reduces exposure to unrelated email,
banking and other applications; with the same owner account it does not create
a staging-only boundary inside Supabase or Vercel.

This is the design's largest residual risk. A production dashboard action may
be detected after it happens rather than prevented at the click.

## 7. Local session sentinel

The sentinel is a deterministic macOS process invoked at agent session end and
on a scheduled catch-up through `launchd`. A session-end hook alone is
insufficient because a crash, forced quit or disabled hook can skip it.

It reads only new material since the last successful checkpoint from:

- Codex JSONL under `~/.codex/sessions`;
- Claude Code JSONL under `~/.claude/projects`;
- the dedicated or selected Chrome profile's History database through a
  SQLite-safe snapshot that includes the write-ahead log;
- guardian hook events and local control-health events;
- repository Git state and recent reflog/remote changes.

Codex and Claude transcripts are heterogeneous. The parser must traverse nested
objects and understand event types; it must not assume all commands live in one
top-level field. Unknown record shapes increment an `unparsed` count and make
coverage incomplete rather than green.

Before any network send, the sentinel removes credential-shaped values, URL
query strings, request bodies, customer fields and free-form page text. It sends
only a verdict and small redacted evidence set. Raw transcripts stay local.

Example clean verdict:

> 3 Oct · 2 sessions · 41 tool calls · 0 protected targets · 0 blocks · controls healthy

Chrome History proves visits, not clicks, submitted forms or saved settings.
That limitation appears in every report that uses it.

Checkpoint state is written atomically with mode `0600` only after the report is
delivered or durably queued. `--dry-run` never advances it. Resetting state is a
visible control event.

## 8. Independent production watcher

The watcher runs in GitHub Actions, outside the Mac and its browser sessions.
It has two schedules:

- **fast, every 15 minutes:** control health, production deployment identity,
  protected-branch state, high-value configuration hashes and database audit
  sequence;
- **deep, nightly:** schema, roles/grants, database integrity metrics, backup
  integrity, configuration inventory and vendor monitoring configuration.

The existing encrypted-backup workflow supplies the natural deep-check
boundary. Monitoring output must not contain database rows or secret values.

### 8.1 GitHub

Check the `main` commit, required status checks, force-push/deletion settings,
workflow-file hashes and production-environment protection. GitHub environment
secrets are available only after their protection rules pass, so production
deployment credentials should live there if deployment is later moved behind
an explicit approval job.

### 8.2 Supabase

Use a dedicated database identity that can read only the catalog, guardian
audit metadata and aggregate integrity views. Do not use the service-role key or
an owner/classic PAT. Current Supabase scoped PATs can be restricted to one
project and selected read permissions; database passwords remain outside PAT
scope and therefore require their own restriction.

The deep check compares:

- normalized schema, functions, RLS policies, roles and grants;
- exact hashes of small operational configuration tables that contain no
  customer data;
- counts and monotonic markers for customer-data tables;
- a privacy-minimised audit sequence for inserts, updates, deletes, DDL and
  security changes.

Counts alone cannot detect an in-place update and `max(created_at)` cannot detect
a delete reliably. Robust customer-data mutation detection therefore needs a
future numbered migration, with its byte-identical paste copy, that records
operation type, table, transaction, actor and keyed before/after hashes without
copying row contents. Tasos remains the only person who may apply that
migration. If that audit layer is not built, the watcher must report customer
row mutation coverage as partial.

### 8.3 Vercel

Check the latest production deployment ID, git SHA, production domain mapping,
deployment-protection state and environment-variable **names and target scopes**.
Never read or transmit environment-variable values.

Vercel project-level roles require Enterprise. Do not put an owner or broad
team token into the watcher merely to fill a coverage box. If a genuinely
read-only project credential is unavailable on the current plan, use public
deployment evidence plus the GitHub/Vercel integration record and label the
private configuration checks `not checked`.

### 8.4 Sentry

Use an integration token limited to `org:read`, `project:read` and only the
additional read scope required by a specific endpoint. `event:read` can expose
customer event data and is excluded unless a later check needs it and its
privacy impact is documented. Check project identity, environments, alert-rule
existence and monitor health rather than event bodies.

### 8.5 Stripe

Staging must use a **general sandbox** and its sandbox-only users/keys. Stripe's
test-mode sandbox shares some settings and access with live mode, so it is not
the preferred isolation boundary for a new staging integration. The existing
deployment-boundary check continues to reject non-test keys on Preview. The
guardian stores and compares key fingerprints or account/sandbox IDs, never
keys.

### 8.6 Baseline storage

Signed watcher results and baselines live in a separate R2 prefix with version
history. The repository contains schemas and policy, not live fingerprints or
customer-derived values. Each run records the policy version, source commit,
check coverage, credential class and previous-result digest.

## 9. Expected production changes

Legitimate production changes must not train the operator to ignore alarms.
Before a planned manual production action, merge a short-lived expected-change
record under `docs/production-changes/` containing:

- unique ID, author and approving person;
- target platform and immutable production identifier;
- operation class and expected fingerprint effect;
- linked PR or numbered migration;
- earliest and latest execution time, with a maximum 24-hour window;
- rollback or recovery reference;
- no secret or customer data.

For a schema change, the record points to the merged migration and its exact
hash. This complements rather than replaces migration paste parity. For a
manual vendor setting, it names the setting and expected state, not its value.

The watcher consumes a record once when all expected effects match. Extra,
missing or late effects remain alerts. An expired unused record alerts and then
closes as unused; it never becomes a standing exception.

## 10. Alerts and failure semantics

| State | Meaning | Notification |
|---|---|---|
| Red | unexpected production change, exact blocked attempt, guardian policy change, lost audit sequence or failed backup | immediate Telegram plus failed GitHub run |
| Amber | partial coverage, unknown log shape, stale credential, unflushed local spool or expected change nearing expiry | one concise daily Telegram report |
| Green | all scheduled checks ran with declared coverage and no finding | one daily verdict; no per-check messages |

No credential, timeout or unsupported endpoint is converted into a pass. It is
`not checked`, names the missing coverage and makes the workflow amber or red
according to the asset. Telegram delivery failure fails the notification step;
the red GitHub Actions result is the second signal. A separate heartbeat records
the last successful fast and deep run so silence is itself observable.

The guardian never automatically rolls back production, deletes data, rotates
credentials or disables a user. It preserves evidence and tells a person what
changed and which recovery procedure applies.

## 11. Credential model

| Component | Identity | Where it lives | Lifetime/scope |
|---|---|---|---|
| Local agents | no production database credential; staging-scoped tokens only where available | OS keychain or session environment, never repository or transcript | session-scoped where supported |
| Local sentinel | Telegram write-only delivery credential if needed | macOS keychain | revocable; cannot read platform data |
| Production watcher | dedicated read-only identities | GitHub environment secrets | project-specific, minimum scopes |
| Backup | existing restricted DB/R2 credentials | GitHub secrets | backup workflow only |
| Browser | Tasos's signed-in owner session under current constraint | Chrome profile | standing until logged out |

The browser row is the exception that prevents a hard staging boundary. Logging
out when idle and a dedicated browser profile remain worthwhile reductions in
exposure, but the production watcher is required while the owner session stays
available.

## 12. Build plan and acceptance gates

Implementation is deliberately split so each control proves its own claim.

### Phase 1 — policy and local adapters

- add the shared policy schema and fixtures;
- add separate Claude Code and Codex adapters;
- narrow the broad Claude command allow;
- add Codex browser policy with turn-only approval and no automatic review;
- prove every blocking regression fails against an unfixed adapter before the
  fix is accepted;
- prove unsupported tool paths report partial coverage.

### Phase 2 — local sentinel

- parse real redacted samples of both agents' heterogeneous logs;
- snapshot Chrome History safely;
- redact before delivery;
- add crash recovery, atomic checkpointing and `launchd` catch-up;
- prove a missed session-end hook is collected on the next scheduled run.

### Phase 3 — off-machine watcher

- extend or companion the existing backup workflow;
- add baseline storage and the expected-change record validator;
- begin with GitHub, schema/roles, backup and public deployment identity;
- add the privacy-minimised database audit migration as a numbered migration and
  paste copy, then hand it to Tasos for application;
- add vendor API checks only with genuinely restricted read identities.

### Phase 4 — production sign-off gate

- require an explicit Tasos-controlled production deployment approval;
- prevent a green feature-branch or `main` merge from being mistaken for that
  approval;
- test recovery and alert routing with synthetic staging events and harmless
  production metadata changes, never by attacking or concealing production.

### Definition of done

The guardian is complete only when:

- both agents use the same policy version and fixtures;
- a known local production mutation is blocked before execution;
- a protected-dashboard visit appears in the local verdict without claiming a
  click occurred;
- an out-of-band safe production-metadata change is detected by the watcher;
- a matching expected-change record is consumed once;
- missing credentials and unsupported checks visibly fail coverage;
- Telegram failure is visible in GitHub Actions;
- the recovery drill restores and verifies the latest protected backup;
- the runbook states every residual risk in this document.

## 13. Deliberate exclusions and sources

The first release excludes screen recording as an enforcement mechanism, a
custom Chrome extension, automatic remediation, production red-team actions and
claims of tamper-proof local logging. Those may add evidence later but do not
replace credential separation or the off-machine watcher.

The design corrects one central claim in the supplied draft: Codex's local
network proxy does **not** reach Chrome. The official sources are:

- [Codex permissions](https://learn.chatgpt.com/docs/permissions) — local
  permission profiles, network-proxy scope and the separate browser/tool
  controls;
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
  — Browser Use origin rules, turn-scoped approvals, automatic review and the
  fact that origin patterns cannot contain paths;
- [Codex hooks](https://learn.chatgpt.com/docs/hooks) — lifecycle events,
  blocking output and documented tool coverage;
- [ChatGPT browser extension](https://learn.chatgpt.com/docs/chrome-extension) —
  signed-in profile access and host-based website permissions;
- [Claude Code hooks](https://code.claude.com/docs/en/hooks) and
  [sandboxing](https://code.claude.com/docs/en/sandboxing) — `PreToolUse` and
  the boundary between sandboxed command traffic and in-process tools;
- [Supabase scoped personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)
  and [access control](https://supabase.com/docs/guides/platform/access-control)
  — project/permission scoping and plan-dependent project roles;
- [Vercel access roles](https://vercel.com/docs/rbac/access-roles) — project
  roles are an Enterprise feature;
- [Stripe testing environments](https://docs.stripe.com/testing-use-cases) —
  general-sandbox isolation and test-mode sharing;
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
  — reviewer gates, branch restrictions and environment secrets;
- [Sentry API scopes](https://docs.sentry.io/api/permissions/) — read/write/admin
  scope separation.
