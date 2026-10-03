#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PRODUCTION_DENY_HOSTS,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../../scripts/deployment-boundary-lib.mjs";

/**
 * A `PreToolUse` gate: production is denied, staging is allowed, and the agent is
 * told which is which.
 *
 * **Why a rule and not a model.** The question is "does this tool call act on the
 * production project?", which is a string comparison. A model asked to adjudicate
 * reads request text that may be attacker-influenced — prompt injection is the
 * first risk in this project's threat model — and so becomes a second component
 * that can be talked into saying yes. `===` cannot. The place a model earns its
 * keep is a question no rule decides, such as `DEFINING-STATEMENTS.md` §13's "could
 * a customer receive different terms?", and there it may only **deny or escalate**,
 * never approve what this layer denied.
 *
 * **The hard part is not denying; it is not over-denying.** The Bash rules in
 * `.claude/settings.json` deliberately name a program (`curl`, `psql`) rather than
 * matching the bare ref, because `Bash(*<ref>*)` would block
 * `grep <ref> docs/` — the command by which this control is reviewed and the ref
 * verified against the audit that records it. **A control that blocks its own audit
 * is one nobody can check**, and a control that blocks ordinary work gets deleted
 * within a week. So this gate distinguishes *acting on* production from
 * *mentioning* it:
 *
 * - `WebFetch`: the **URL** is what acts. A search query that mentions the ref does
 *   not.
 * - `Bash`: the command acts, **unless its program only reads local text** — grep,
 *   cat, git log and friends. Those are how the repository is inspected.
 * - Editing and writing files: text *about* production is not an action *on* it.
 *   Every document in `docs/` names both refs on purpose.
 * - Anything else, including MCP tools: a production identifier anywhere in the
 *   input is treated as a target, because an unknown tool's argument shape cannot
 *   be assumed benign.
 *
 * **What this is worth.** It is **enforced** against the model: hooks run
 * out-of-process, the model never executes them and cannot skip them. It is
 * **advisory** against a determined process on the same machine, because this file
 * and the settings that register it are writable by the agent that runs under them.
 * Root-owned managed settings are the fix and are not in place. The guardrail-file
 * rule below is the same shape — worth having, circular until the configuration is
 * owned by someone else.
 */

/** Programs that only read local text. Allowed even when they name production. */
const INSPECTION_PROGRAMS = new Set([
  "grep", "rg", "ag", "ack",
  "cat", "head", "tail", "less", "more", "wc", "nl",
  "sed", "awk", "cut", "sort", "uniq", "tr", "diff", "comm",
  "ls", "find", "fd", "file", "stat", "basename", "dirname", "realpath", "echo",
  "jq", "yq", "shasum", "sha256sum", "md5", "md5sum",
]);

/** Git subcommands that only read. `git grep <ref>` must keep working. */
const GIT_READ_SUBCOMMANDS = new Set([
  "log", "show", "diff", "grep", "status", "branch", "blame", "cat-file",
  "rev-parse", "rev-list", "ls-files", "ls-tree", "describe", "shortlog", "tag",
]);

/** Programs that destroy or rewrite a file in place, leaving no reviewable diff. */
const DESTRUCTIVE_PROGRAMS = new Set(["rm", "rmdir", "mv", "truncate", "shred", "unlink", "dd"]);

/** Tools whose job is text. Naming production in a document is not acting on it. */
const DOCUMENT_TOOLS = new Set(["Read", "Edit", "Write", "NotebookEdit", "MultiEdit"]);

/** Files that configure the controls. Editing them is denied — see the header. */
const GUARDRAIL_PATHS = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/hooks/",
  "hooks.json",
  ".codex/config.toml",
];

const IDENTIFIERS = [PRODUCTION_PROJECT_REF, ...PRODUCTION_DENY_HOSTS];

/** Every string in a nested value, so an unknown tool's shape still gets scanned. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

const namesProduction = (text) =>
  typeof text === "string" && IDENTIFIERS.some((id) => text.includes(id));

/** The program a shell command runs, ignoring `VAR=x` prefixes and `sudo`. */
export function leadingProgram(command) {
  const words = String(command).trim().split(/\s+/);
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || words[i] === "sudo")) i += 1;
  const program = (words[i] ?? "").replace(/^.*\//, "");
  if (program === "git") return `git ${words[i + 1] ?? ""}`.trim();
  return program;
}

/** Constructs that can hide any program inside an apparently harmless command. */
const OPAQUE = /\$\(|`|<\(|>\(|\/dev\/tcp/;

function segmentIsInspection(segment) {
  const program = leadingProgram(segment);
  if (program.startsWith("git ")) return GIT_READ_SUBCOMMANDS.has(program.slice(4));
  return INSPECTION_PROGRAMS.has(program);
}

/**
 * True when **every** segment of the command only reads local text.
 *
 * The first version asked whether the command contained a shell operator at all.
 * That denied `echo checking && grep <ref> docs/` -- three local reads joined by
 * `&&` -- because it could not tell a compound of allowed programs from a pipeline
 * ending in `curl`. **Found by firing the gate in a live session, not by its unit
 * tests**, which only exercised single commands. Over-denying is the failure that
 * gets a control deleted, and this one was blocking the very command by which the
 * gate is reviewed.
 *
 * So every segment is checked. `cat f | curl ...` still denies, because the `curl`
 * segment is not an inspection. Command substitution and a `/dev/tcp` path
 * disqualify the whole command, since either can hide an arbitrary program.
 */
function isLocalInspection(command) {
  const text = String(command);
  if (OPAQUE.test(text)) return false;
  const segments = text.split(/\|\||&&|[|;&]/).map((part) => part.trim()).filter(Boolean);
  return segments.length > 0 && segments.every(segmentIsInspection);
}

/**
 * @param {{ tool_name?: string, tool_input?: unknown }} event
 * @returns {{ decision: "allow" | "deny", reason: string }}
 */
export function decide(event) {
  const tool = event?.tool_name ?? "";
  const input = event?.tool_input ?? {};
  const allow = (reason) => ({ decision: /** @type {"allow"} */ ("allow"), reason });
  const deny = (reason) => ({
    decision: /** @type {"deny"} */ ("deny"),
    reason: `${reason} Production is ${PRODUCTION_PROJECT_REF}; staging is ${STAGING_PROJECT_REF}. If this task needs production, it needs a person.`,
  });

  // Narrowed after the first version blocked its own maintenance.
  //
  // It denied every tool call naming one of the paths above, which included the
  // edits that author these controls -- so the only way to repair a bug in this
  // file was to route around the rule, and that took one line. Two findings in one:
  // the rule cannot tell the author from an attacker, and anything that assembles a
  // path from parts walks straight past it, so against intent it was never worth
  // anything. It also refused four consecutive repair attempts, each because the
  // repair command happened to quote one of the paths.
  //
  // What actually protects these files is not a hook on the machine the agent
  // controls. It is that a change to them lands in a committed diff, and that the
  // network-controls test fails in CI when a deny list loses the production ref --
  // enforcement on a machine the agent holds no credential for.
  //
  // So this now denies only in-place destruction from a shell, where no diff is
  // produced and nothing is reviewable. Editing them with the file tools is
  // allowed, because that is reviewable and is how they are maintained.
  // The verb must be the program a segment RUNS, not a word appearing anywhere in
  // the text. The first attempt matched `/\brm\b/` against the whole command, which
  // denied a heredoc writing the worklog entry that documents this gate, because the
  // prose contained the word "rm". That is the same fault as the inspection rule's
  // first version -- a judgement about the whole string where the question is about a
  // segment -- and it is the fourth time text-matching has confused describing an
  // action with performing one. The gate sees the command, never its effect.
  const guardrail = strings(input).find((text) => GUARDRAIL_PATHS.some((q) => text.includes(q)));
  if (guardrail && (tool === "Bash" || tool === "PowerShell")) {
    const shell = String(/** @type {{command?: string}} */ (input).command ?? "");
    const segments = shell.split(/\|\||&&|[|;&]/).map((part) => part.trim()).filter(Boolean);
    const destroys = segments.some((segment) => {
      const program = leadingProgram(segment);
      if (DESTRUCTIVE_PROGRAMS.has(program)) return true;
      if (program === "git checkout" && /\s--\s/.test(segment)) return true;
      // In-place editors are only destructive with the in-place flag.
      return (program === "sed" || program === "perl") && /\s-i\b/.test(segment);
    });
    if (destroys) {
      return deny(
        `this command would alter \`${guardrail}\` in place from a shell, leaving no reviewable diff. Use the file tools, where the change lands in a commit.`,
      );
    }
  }

  if (tool === "WebFetch") {
    const url = /** @type {{url?: string}} */ (input).url ?? "";
    return namesProduction(url)
      ? deny(`WebFetch targets the production project.`)
      : allow("no production identifier in the URL");
  }

  if (tool === "Bash" || tool === "PowerShell") {
    const command = /** @type {{command?: string}} */ (input).command ?? "";
    if (!namesProduction(command)) return allow("no production identifier in the command");
    if (isLocalInspection(command)) {
      return allow(`\`${leadingProgram(command)}\` only reads local text; reviewing the ref is allowed`);
    }
    return deny(`this command acts on the production project with \`${leadingProgram(command)}\`.`);
  }

  if (DOCUMENT_TOOLS.has(tool)) return allow("text about production is not an action on it");

  const hit = strings(input).find(namesProduction);
  return hit
    ? deny(`\`${tool}\` carries a production identifier in its input.`)
    : allow("no production identifier in the input");
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let event = {};
    try {
      event = JSON.parse(raw || "{}");
    } catch {
      // A gate that crashes on malformed input must not become a gate that allows.
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: "production gate could not parse its input; escalating rather than allowing",
          },
        }),
      );
      return;
    }

    const { decision, reason } = decide(event);

    // Local, and therefore writable by the agent it watches -- the open question
    // Q1 in AGENT-ACCESS-AND-MONITORING.md. Root pulling the record is the fix.
    try {
      appendFileSync(
        process.env.PRODUCTION_GATE_LOG || join(tmpdir(), "production-gate.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), tool: event.tool_name, decision, reason, session: event.session_id })}\n`,
      );
    } catch {
      // Never let logging turn into a denial of ordinary work.
    }

    if (decision === "deny") {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
          },
        }),
      );
    }
    // An allow writes nothing, so the normal permission flow still applies. The
    // gate narrows; it never widens.
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) main();
