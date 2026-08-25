#!/usr/bin/env node
/**
 * Alternating architect / implementer loop for Claude and Codex.
 *
 * The roles are defined in AGENTS.md. This script only sequences them; it does
 * not restate what they mean.
 *
 * Five things here exist because of specific failures on this project, and are
 * worth keeping even if the rest is rewritten:
 *
 * 1. It refuses to start on a dirty tree, and works on its own branch. Anything
 *    that reverts with `git reset --hard` will otherwise destroy uncommitted
 *    work that was never the agent's to touch.
 * 2. It verifies each CLI answers before looping. An invalid flag exits
 *    non-zero, which reads as an ordinary failure, and the loop then does
 *    nothing at all for six turns while appearing to work.
 * 3. The architect writes into docs/RENTAL-SYSTEM-BLUEPRINT.md, not a scratch
 *    file that gets deleted. AGENTS.md: the handover is the document, not the
 *    conversation. A design that exists only in a temp file is re-derived next
 *    run — that is the §9 failure that cost a duplicated benchmark.
 * 4. The commit gate is the full suite, not `npm test`. Tests in this repo have
 *    twice asserted the bug and passed: the frozen-pane wrapper test and the
 *    phone-override test both locked in defects while green.
 * 5. It never pushes. A branch is left for a human to read.
 *
 * Usage:
 *   node scripts/agent-loop.mjs "one sentence saying what to build"
 *   node scripts/agent-loop.mjs --turns 3 --dry-run "..."
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------- config ----

const MAX_TURNS = Number(argOf("--turns") ?? 4);
const DRY_RUN = process.argv.includes("--dry-run");
const AGENT_TIMEOUT_MS = 20 * 60 * 1000;   // a hung agent must not block forever
const MAX_SPEC_BYTES = 50 * 1024;

const BLUEPRINT = "docs/RENTAL-SYSTEM-BLUEPRINT.md";
const TURN_SPEC = ".agent-turn-spec.md";   // scratch, and gitignored — see preflight

/**
 * Command and arguments per agent, as ARRAYS. Never build a shell string: a
 * prompt containing a backtick or $(…) is otherwise executed by the shell.
 *
 * The flags here are the ones that were verified to exist during preflight. If
 * a CLI changes, preflight fails loudly rather than the loop silently doing
 * nothing.
 */
const AGENTS = {
  claude: { bin: "claude", args: (prompt) => ["-p", prompt] },
  codex:  { bin: "codex",  args: (prompt) => ["exec", prompt] },
};

/** The gate a turn must pass before anything is committed. */
const VERIFY = [
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
];

/**
 * Substring matching alone marks an agent dead when a test happens to print
 * "quota". Require a phrase that only appears in a real limit response.
 */
const LIMIT_PATTERNS = [
  /rate[_ ]limit/i, /\b429\b/i, /usage limit reached/i,
  /insufficient_quota/i, /credit balance is too low/i, /quota exceeded/i,
];

const limited = { claude: false, codex: false };

// ----------------------------------------------------------------- utils ----

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function say(msg) { process.stdout.write(`${msg}\n`); }

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

// ------------------------------------------------------------- preflight ----

function preflight() {
  say("── preflight ─────────────────────────────────────────");

  // A dirty tree plus a hard reset on failure is how uncommitted work is lost.
  const dirty = git(["status", "--porcelain"]);
  if (dirty) {
    say("  working tree is not clean:");
    say(dirty.split("\n").map((l) => `      ${l}`).join("\n"));
    fail("Commit or stash first. This script reverts failed turns with `git reset --hard`, which would take your work with it.");
  }
  say("  working tree clean");

  // Never run in the primary checkout: a bad turn there is a bad turn in the
  // copy a person is using.
  const gitDir = git(["rev-parse", "--git-dir"]);
  const isWorktree = gitDir.includes(".git/worktrees/") || existsSync(".git") === false;
  say(`  checkout: ${isWorktree ? "worktree" : "primary"}${isWorktree ? "" : "  ← prefer a worktree"}`);

  // Verify each CLI actually answers. An unknown flag exits non-zero, which
  // reads as an ordinary failure, and the loop then no-ops for every turn.
  for (const [name, spec] of Object.entries(AGENTS)) {
    try {
      execFileSync("which", [spec.bin], { stdio: "ignore" });
    } catch {
      fail(`${name}: \`${spec.bin}\` is not on PATH. Install it, or drop it from AGENTS and run single-agent.`);
    }
    try {
      execFileSync(spec.bin, ["--version"], { stdio: "ignore", timeout: 30_000 });
      say(`  ${name}: responds`);
    } catch {
      fail(`${name}: \`${spec.bin} --version\` failed. Fix the invocation before looping.`);
    }
  }

  if (!existsSync(BLUEPRINT)) fail(`${BLUEPRINT} is missing — the architect has nowhere to write.`);
  say(`  ${BLUEPRINT} present`);

  // Keep the scratch spec out of commits without touching the tracked ignore file.
  const exclude = ".git/info/exclude";
  try {
    if (!readFileSync(exclude, "utf8").includes(TURN_SPEC)) appendFileSync(exclude, `\n${TURN_SPEC}\n`);
  } catch { /* worktrees keep this elsewhere; harmless if it fails */ }

  say("");
}

function fail(msg) {
  say(`\n  STOP: ${msg}\n`);
  process.exit(1);
}

// -------------------------------------------------------------- agent io ----

function runAgent(name, prompt) {
  if (limited[name]) return { ok: false, limit: true, out: "already limited" };
  const spec = AGENTS[name];

  if (DRY_RUN) {
    say(`  [dry-run] ${spec.bin} ${spec.args("<prompt>").join(" ")}`);
    return { ok: true, limit: false, out: "" };
  }

  try {
    // inherit: the operator sees the agent work. A silent multi-turn loop is
    // indistinguishable from a hung one.
    execFileSync(spec.bin, spec.args(prompt), { stdio: "inherit", timeout: AGENT_TIMEOUT_MS });
    return { ok: true, limit: false, out: "" };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`;
    const isLimit = LIMIT_PATTERNS.some((re) => re.test(out));
    if (isLimit) {
      limited[name] = true;
      say(`  ${name} hit its limit`);
    } else if (err.signal === "SIGTERM") {
      say(`  ${name} timed out after ${AGENT_TIMEOUT_MS / 60000} minutes`);
    }
    return { ok: false, limit: isLimit, out };
  }
}

/** Try the preferred agent, then the other one. Returns who actually ran. */
function runWithFailover(preferred, prompt) {
  const other = preferred === "claude" ? "codex" : "claude";
  let r = runAgent(preferred, prompt);
  if (r.ok) return { agent: preferred, ...r };
  if (r.limit && !limited[other]) {
    say(`  handing over to ${other}`);
    r = runAgent(other, prompt);
    if (r.ok) return { agent: other, ...r };
  }
  return { agent: null, ...r };
}

// --------------------------------------------------------------- verify -----

function verify() {
  for (const [bin, args] of VERIFY) {
    say(`  ${bin} ${args.join(" ")}`);
    try {
      execFileSync(bin, args, { stdio: "inherit", timeout: 15 * 60 * 1000 });
    } catch {
      say(`  FAILED: ${bin} ${args.join(" ")}`);
      return false;
    }
  }
  return true;
}

// ----------------------------------------------------------------- main -----

async function main() {
  const goal = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== String(MAX_TURNS)).join(" ");
  if (!goal) fail('Say what to build:  node scripts/agent-loop.mjs "add stop-sells to the fleet screen"');

  preflight();

  const branch = `codex/agent-loop-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
  git(["checkout", "-b", branch]);
  say(`branch: ${branch}\ngoal:   ${goal}\n`);

  // ---- phase 1: architecture, written where it survives ----
  say("── phase 1: architecture ─────────────────────────────");
  const architectBrief = [
    `You are the ARCHITECT. Read AGENTS.md for what that means, then docs/README.md.`,
    `Goal: ${goal}`,
    `Before proposing anything, check whether ${BLUEPRINT} already answers it — DEFINING-STATEMENTS.md §9.`,
    `Write your decision as a new section in ${BLUEPRINT}: scope, reasoning, and what you deliberately exclude.`,
    `Do not write application code.`,
  ].join("\n");

  const drafted = runWithFailover("claude", architectBrief);
  if (!drafted.agent) fail("Neither agent could draft. Nothing was changed.");

  const reviewBrief = [
    `You are REVIEWING an architecture decision just added to ${BLUEPRINT}.`,
    `Goal: ${goal}`,
    `Engage with the reasoning recorded there rather than restating the topic.`,
    `Append your review to the same section. Do not write application code.`,
  ].join("\n");
  runWithFailover(drafted.agent === "claude" ? "codex" : "claude", reviewBrief);

  // ---- the human gate ----
  const diff = git(["diff", "--stat"]);
  say(`\n── proposed ──────────────────────────────────────────\n${diff || "(no changes)"}\n`);
  say(git(["diff", "--", BLUEPRINT]).slice(0, 8000));

  const answer = await ask("\nApprove this and start building? (yes/no) ");
  if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
    git(["checkout", "--", "."]);
    git(["checkout", "-"]);
    git(["branch", "-D", branch]);
    say("Rejected. Branch deleted, nothing changed.");
    process.exit(0);
  }

  git(["add", BLUEPRINT]);
  git(["commit", "-m", `Architecture for: ${goal}`]);
  say("\nApproved and committed.\n");

  // ---- phase 2: alternating build turns ----
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    say(`\n── turn ${turn}/${MAX_TURNS} ──────────────────────────────────`);

    if (limited.claude && limited.codex) {
      say("Both agents are limited. Stopping; the branch holds the work so far.");
      break;
    }
    if (existsSync(TURN_SPEC) && Buffer.byteLength(readFileSync(TURN_SPEC)) > MAX_SPEC_BYTES) {
      say(`${TURN_SPEC} exceeds ${MAX_SPEC_BYTES} bytes. Stopping rather than spending on an oversized prompt.`);
      break;
    }

    // Alternate. If the preferred architect is limited the roles are NOT both
    // given to one agent silently — the swap is announced.
    const architect = turn % 2 ? "claude" : "codex";
    const doer = turn % 2 ? "codex" : "claude";
    say(`architect: ${architect}   implementer: ${doer}`);

    const turnStart = git(["rev-parse", "HEAD"]);

    writeFileSync(TURN_SPEC, `# Turn ${turn}\n\nGoal: ${goal}\n`);
    const archStep = runWithFailover(architect, [
      `You are the ARCHITECT for turn ${turn}. Read ${BLUEPRINT} and the failing output from the last turn if any.`,
      `Write the next concrete step into ${TURN_SPEC}. One step, small enough to verify.`,
      `If the blueprint is wrong or silent, say so there and stop — do not redesign mid-branch.`,
    ].join("\n"));
    if (!archStep.agent) { say("No architect available. Stopping."); break; }

    const buildStep = runWithFailover(doer, [
      `You are the IMPLEMENTER for turn ${turn}. Read ${TURN_SPEC} and build exactly that.`,
      `A new regression test must be run against the unfixed code and seen to FAIL before you trust it — AGENTS.md.`,
      `Never apply a Supabase migration. Write the numbered migration and its byte-identical paste copy.`,
    ].join("\n"));
    if (!buildStep.agent) { say("No implementer available. Stopping."); break; }

    say("\n── verify ────────────────────────────────────────────");
    if (verify()) {
      git(["add", "-A"]);
      git(["reset", "--", TURN_SPEC]);   // scratch never gets committed
      const staged = git(["diff", "--cached", "--stat"]);
      if (staged) {
        git(["commit", "-m", `Turn ${turn}: ${goal}\n\narchitect: ${architect}\nimplementer: ${buildStep.agent}`]);
        say(`\nTurn ${turn} committed.`);
      } else {
        say(`\nTurn ${turn} produced no changes.`);
      }
    } else {
      // Safe only because preflight proved the tree was clean and we are on our
      // own branch: nothing here was ever the operator's uncommitted work.
      say(`\nTurn ${turn} failed verification. Reverting to ${turnStart.slice(0, 7)}.`);
      git(["reset", "--hard", turnStart]);
      git(["clean", "-fd"]);
    }
  }

  say(`\n── done ──────────────────────────────────────────────`);
  say(`branch ${branch} — nothing was pushed. Review it, then open a PR yourself.`);
  say(git(["log", "--oneline", `origin/main..HEAD`]));
}

main().catch((e) => fail(e.message));
