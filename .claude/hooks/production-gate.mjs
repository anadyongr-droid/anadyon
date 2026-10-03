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
 * **What this is worth, stated so nobody over-reads it.** This is an **advisory
 * identifier guard**, not a firewall, and the difference is not pedantic:
 *
 * - It is **enforced against the model** in the narrow sense that hooks run
 *   out-of-process, so the model cannot skip them.
 * - It only sees **the literal production identifier in a tool call**. Codex
 *   demonstrated on 3 October 2026 that a command which *derives* the destination
 *   at runtime walks past it: `source .env.local && npm run dev` names nothing and
 *   is allowed. Two of its four demonstrations are now closed — writing the URL
 *   into an env file by redirect, and writing one with the file tools — and
 *   `tests/productionGate.test.ts` keeps the remaining one in the suite **as an
 *   expected-allow**, so the limit stays visible rather than believed away.
 * - It is **advisory against intent**, because this file and the settings that
 *   register it are writable by the agent running under them. Root-owned managed
 *   configuration is the fix and is not in place.
 *
 * So the sentence to use is "production is denied to an *accidental, directly
 * addressed* tool call". The boundary that holds whatever the agent types is
 * **staging-only credentials** and an **external network or browser policy**; a
 * gate on the machine the agent controls is the warning layer in front of them.
 */

/** Programs that only read local text. Allowed even when they name production. */
const INSPECTION_PROGRAMS = new Set([
  "grep", "rg", "ag", "ack",
  "cat", "head", "tail", "less", "more", "wc", "nl",
  "sed", "awk", "cut", "sort", "uniq", "tr", "diff", "comm",
  "ls", "find", "fd", "file", "stat", "basename", "dirname", "realpath", "echo",
  // Navigation and no-ops act on nothing, and excluding them made a denial name
  // `cd` as the program that reached production.
  "cd", "pwd", "true",
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

/**
 * True when a segment redirects into a file.
 *
 * **Why an inspection stops being one the moment it writes.** `echo` is on the
 * list above because printing text is not acting on production. But
 * `echo 'SUPABASE_URL=https://<ref>.supabase.co' > .env.local` is the same
 * program and a different act: it puts a production credential target on disk,
 * where the next command picks it up without ever naming it. Codex demonstrated
 * exactly that on 3 October 2026 and the gate allowed it, because the rule asked
 * which program ran and never asked where its output went.
 *
 * `2>&1`, `>&2` and `1>&2` are stripped first: those move a stream, not data
 * into a file, and denying them would refuse `grep <ref> docs/ 2>&1 | less`,
 * which is an inspection and must keep working.
 */
const STREAM_DUP = /\d*>&\d*/g;

/**
 * The commands a shell line runs, split on the operators that chain them.
 *
 * Stream duplication is stripped **before** the split, not after, because
 * `2>&1` contains `&` and the splitter treats `&` as a separator: leaving it in
 * cut `grep <ref> docs/ 2>&1 | less` into a segment ending `2>`, which the rule
 * below then read as a write to a file and denied. Found by the test for the
 * redirect rule, one minute after the redirect rule was written -- the same
 * over-denial that has now bitten this file six times, always because a
 * judgement about a whole string was asked of a piece of one.
 */
function shellSegments(command) {
  return String(command)
    .replace(STREAM_DUP, " ")
    .split(/\|\||&&|[|;&]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const writesToAFile = (segment) => />>?/.test(segment);

/** An env file is a credential target, never a document, whatever tool writes it. */
const ENV_FILE = /(^|[\/\\])\.env/;

function segmentIsInspection(segment) {
  if (writesToAFile(segment)) return false;
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
  const segments = shellSegments(text);
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
    const segments = shellSegments(shell);
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
    // Name the segment that is actually the problem, not the first word of the
    // line. `leadingProgram` on a whole compound reported operators and `cd` —
    // a denial saying "acts on production with `&&`" tells the reader nothing
    // and invites them to retry the same command a different way.
    const suspects = shellSegments(command).filter((segment) => !segmentIsInspection(segment));
    const culprit = suspects.find(namesProduction) ?? suspects[0];
    return deny(
      culprit
        ? `this command acts on the production project with \`${leadingProgram(culprit)}\`.`
        : `this command acts on the production project.`,
    );
  }

  if (DOCUMENT_TOOLS.has(tool)) {
    // ...with one exception, and it is the whole of the distinction. A document
    // describes production; an env file *points at* it, and whatever is run next
    // reaches production without naming it, so no later rule can see it. Codex
    // demonstrated this route on 3 October 2026.
    const path = String(/** @type {{file_path?: string}} */ (input).file_path ?? "");
    if (ENV_FILE.test(path) && strings(input).some(namesProduction)) {
      return deny(`\`${tool}\` would write a production identifier into \`${path}\`, which is a credential target rather than a document.`);
    }
    return allow("text about production is not an action on it");
  }

  const hit = strings(input).find(namesProduction);
  return hit
    ? deny(`\`${tool}\` carries a production identifier in its input.`)
    : allow("no production identifier in the input");
}

/**
 * One line per decision, appended to a JSONL file.
 *
 * **Why every decision and not only the denials.** A control that records only
 * what it blocked cannot tell "it allowed this" from "it was never asked" --
 * and on 3 October 2026 that distinction was the whole of open item W32, where
 * an empty log was read as the hook being bypassed when in fact nothing was
 * listening. A log with an allow in it for the same session answers that.
 *
 * **Added to the unparseable path on 3 October (evening).** That branch denied
 * and returned without writing anything, so the one case where the gate cannot
 * say what it was asked about was also the one case it kept no record of --
 * found by running the hook as a process rather than calling `decide()`.
 *
 * The file is local, and therefore writable by the agent it watches: question Q1
 * in AGENT-ACCESS-AND-MONITORING.md. Root pulling the record off the machine is
 * the fix, and W34 is the configuration half of the same problem.
 */
function record(event, decision, reason) {
  try {
    appendFileSync(
      process.env.PRODUCTION_GATE_LOG || join(tmpdir(), "production-gate.jsonl"),
      // `gate` is the path of the copy that made the decision, added 3 October
      // 2026 and immediately useful. Two copies are now registered — the
      // root-owned one from managed settings and the project's own — and the
      // first real refusal on the Mac could not be attributed to either,
      // because the log recorded the decision and not the decider. One field
      // answers "is the sudo install actually doing the work?", which is the
      // whole question W34 turns on, and it answers it for every future
      // refusal rather than for one test.
      `${JSON.stringify({ at: new Date().toISOString(), tool: event?.tool_name, decision, reason, session: event?.session_id, gate: process.argv[1] ?? null })}\n`,
    );
  } catch {
    // Never let logging turn into a denial of ordinary work.
  }
}

/**
 * Refuses a call in the way **both** agents implement.
 *
 * Three signals for one decision, because the two hosts read different ones and
 * this file is loaded by both:
 *
 * - the `deny` JSON on stdout, which Claude Code acts on and which carries the
 *   reason back to the model in a field made for it;
 * - the reason on **stderr**, which is where Codex takes the reason from on a
 *   blocking exit;
 * - **exit 2**, which both document as block.
 *
 * `ask` is deliberately not used. Codex parses it for PreToolUse, reports a hook
 * error, and *continues the call* — so an escalation written for Claude Code is
 * an allow on Codex, which is the worse of the two to fail open.
 */
function block(reason, event = {}) {
  record(event, "deny", reason);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
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
      //
      // This said `ask` until 3 October 2026, which failed closed on Claude Code
      // and **open on Codex**: Codex parses `permissionDecision: "ask"` for
      // PreToolUse, reports it as a hook error, and continues the tool call. So
      // the one path meant to escalate was the one path that let a malformed
      // event straight through on the agent with the browser. Found by Codex.
      // `deny` is the only decision both agents implement, so unparseable input
      // is denied and the reason says to re-issue it.
      block("production gate could not parse its input, so it cannot tell what this call targets; denying rather than allowing. Re-issue the call, or ask a person.");
      return;
    }

    const { decision, reason } = decide(event);
    if (decision === "deny") block(reason, event);
    else record(event, decision, reason);
    // An allow writes nothing, so the normal permission flow still applies. The
    // gate narrows; it never widens.
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) main();
