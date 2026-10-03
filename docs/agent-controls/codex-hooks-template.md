# Installing the shared gate on Codex

`codex-hooks-template.json` is pasted into `~/.codex/hooks.json`. The commentary
lives here rather than in that file, and that is the first of three corrections
made on 3 October 2026 — see **What was wrong** below.

## Install

1. Copy `codex-hooks-template.json` to `~/.codex/hooks.json`.
2. Replace `ABSOLUTE_PATH_TO_REPO` with the checkout path. It must be absolute:
   Codex's working directory is not guaranteed to be the repository root.
3. Set `features.hooks = true` in `~/.codex/config.toml`.
4. **Run `/hooks` in Codex and trust the hook.** A non-managed hook loads with
   `trustStatus: "untrusted"` and **does not run** until the exact definition is
   reviewed and trusted. Codex documents this; it is not optional, and a hook
   that is present but untrusted looks installed and enforces nothing.
5. Confirm with `/hooks` that the gate is listed **and enabled**, then fire a
   deliberate denial — `curl https://<production-ref>.supabase.co/rest/v1/` —
   and check that it is refused and that a line appears in the decision log
   (`$TMPDIR/production-gate.jsonl`, or `PRODUCTION_GATE_LOG`).

Step 5 is the whole point of this file. Every claim this project has made about
Codex hooks that was wrong was wrong because somebody inferred the state of the
installation instead of asking the installation.

## What was wrong, and how it was found

The first version of this template was **structurally invalid** and loaded zero
hooks. Codex found it on 3 October 2026 by querying the installed app's own hook
inventory, and the app said:

```
unknown field `PreToolUse`, expected `description` or `hooks`
```

Three things follow, and the third is mine rather than Codex's.

**1. Event names go inside a top-level `hooks` object.** The template had
`PreToolUse` at the top level. Corrected, and verified against
<https://learn.chatgpt.com/docs/hooks>, which gives exactly this shape.

**2. So W32 was a false conclusion, and the reasoning is the lesson.** This
project recorded that *the ChatGPT desktop app does not invoke
`~/.codex/hooks.json`*. The evidence was that a test request reached production
with the file in place. But the file could not have fired on **any** surface,
because nothing loaded it — so the observation was consistent with the app
supporting hooks perfectly. A negative result from an instrument that was never
switched on says nothing about the thing being measured, and `AGENTS.md` already
carries this rule for reproductions: *assert the preconditions first*. I asserted
that Codex had been restarted and never that the config was valid. Codex then
showed the corrected file being found and enabled by the same app.

**3. `_comment` had to go, and this is the correction Codex did not report.**
The error above is a strict-schema rejection: the loader accepts `description`
or `hooks` and refuses anything else. A `_comment` key is equally unknown, so a
template carrying one is equally unloadable — adding the wrapper alone would not
have been enough. Hence this `.md`.

## Two things in the template that are corrected but NOT re-tested

Stated as unverified per `DEFINING-STATEMENTS.md` §8, because they cannot be
checked from an agent container — only on the machine with Codex installed:

- **`matcher` is now `".*"`, not `"*"`.** Codex's documented matchers are
  regular expressions (`"startup|resume"`), and `*` is not a valid regex. Claude
  Code's own `.claude/settings.json` keeps `"*"`, which is correct *there*.
- **`statusMessage`** is taken from the documented example and is cosmetic.

`/hooks` confirms or refutes both in one command. Until someone runs it, this
file's own instructions are the only evidence, which is exactly the state that
produced W32.

## What this does and does not reach

**Does:** Codex's local tool calls — shell, file edits, MCP — which is the same
surface Claude Code's hook covers, so both agents run one decision procedure
instead of two that drift.

**Does not:** the browser. Codex's hooks fire for tool use; a click in a
logged-in dashboard is not a tool call. Nor does it bound a command that derives
its destination at runtime — the gate matches the production identifier in the
call, and `source .env.local && npm run dev` contains none. Both limits are in
the gate's own header and in `tests/productionGate.test.ts`, the second as an
expected-allow.

**And it is writable by the agent it governs**, as is `~/.codex/hooks.json`
itself. Root-owned managed configuration is the fix and is not in place.
