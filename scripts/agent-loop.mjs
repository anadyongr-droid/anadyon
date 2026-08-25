#!/usr/bin/env node
/**
 * Alternating architect / implementer loop for Claude and Codex.
 *
 * The roles are defined in AGENTS.md. This script only sequences them.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *
 * It does not sandbox the agents. They inherit the operator's environment,
 * credentials and CLI configuration, so nothing here technically prevents an
 * agent pushing, deploying, or reaching production Supabase — "never apply a
 * migration" is a sentence in a prompt, not a control. Run it only in a
 * disposable linked worktree, and read the branch before pushing anything.
 * Enforcing that properly needs a restricted profile per CLI and is not built.
 *
 * GUARDS, AND THE FAILURE EACH ONE ANSWERS
 *
 * 1. Refuses to start on a dirty tree. `git reset --hard` on a failed turn
 *    otherwise destroys work that was never the agent's.
 * 2. Refuses to run outside a linked worktree. A bad turn in the primary
 *    checkout is a bad turn in the copy a person has open.
 * 3. Branches from an explicit, verified base — not from whatever HEAD happens
 *    to be, which may be a stale commit or another feature branch.
 * 4. Exercises the REAL argument array in preflight, not `--version`. A CLI
 *    answering `--version` proves nothing about the flags the loop passes.
 * 5. Captures agent output while streaming it. An earlier version used
 *    stdio:"inherit", which streams but captures nothing — so the rate-limit
 *    patterns had nothing to match and the entire failover path was dead code
 *    that could never fire.
 * 6. Records the agent that ACTUALLY ran, not the one intended. --continue
 *    recovers the previous architect from these messages, so recording intent
 *    corrupts the alternation it exists to preserve.
 * 7. The architect phase may touch only the blueprint; anything else is rolled
 *    back rather than swept into a later `git add -A`.
 * 8. The commit gate is the full suite. Tests here have twice asserted the bug
 *    and passed.
 * 9. Defaults to ONE turn, and never pushes.
 *
 * Usage:
 *   node scripts/agent-loop.mjs "what to build"           one turn
 *   node scripts/agent-loop.mjs --continue                next turn, roles swap
 *   node scripts/agent-loop.mjs --dry-run "what to build" mutates nothing
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------- config ----

const MAX_TURNS = Number(argOf("--turns") ?? 1);   // one, deliberately
const BASE = argOf("--base") ?? "origin/main";
const DRY_RUN = process.argv.includes("--dry-run");
const CONTINUE = process.argv.includes("--continue");
const ALLOW_PRIMARY = process.argv.includes("--allow-primary");
const AGENT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_SPEC_BYTES = 50 * 1024;

const BLUEPRINT = "docs/RENTAL-SYSTEM-BLUEPRINT.md";
const TURN_SPEC = ".agent-turn-spec.md";

/**
 * Command and arguments per agent, as ARRAYS. Never build a shell string.
 *
 * To add a token ceiling or model pin, put it here — e.g.
 * ["exec", "--max-tokens", "4000", prompt] — and preflight will exercise that
 * exact array before the loop starts. Do not add a flag without checking it
 * exists: an early draft carried --max-tokens and -c model=gpt-5.6-terra,
 * neither of which was verified.
 */
export const AGENTS = {
  claude: { bin: "claude", args: (prompt) => ["-p", prompt] },
  codex:  { bin: "codex",  args: (prompt) => ["exec", prompt] },
};

const VERIFY = [
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
];

/** Substring matching alone marks an agent dead when a test prints "quota". */
export const LIMIT_PATTERNS = [
  /rate[_ ]limit/i,
  // Not /\b429\b/ — that fires on ordinary output such as "429 rows updated",
  // which would mark an agent dead for the whole run. Require the status to
  // appear as a status.
  /\b(?:HTTP[\/ ]?)?429\b[^\n]{0,20}(?:too many requests|rate)/i,
  /status(?:[ _]?code)?["' :=]+429\b/i,
  /usage limit reached/i,
  /insufficient_quota/i,
  /credit balance is too low/i,
  /quota exceeded/i,
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
function fail(msg) { say(`\n  STOP: ${msg}\n`); process.exit(1); }
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a); }));
}

/**
 * The scratch spec must be excluded via the REAL path. In a linked worktree
 * `.git` is a file, so ".git/info/exclude" raises ENOTDIR — and a try/catch
 * around it leaves the spec untracked, which then blocks the next --continue on
 * a dirty tree. The recommended layout would have broken the recommended
 * workflow.
 */
function excludePath() {
  return git(["rev-parse", "--git-path", "info/exclude"]);
}

/** Which agent should hold which chair, given who held it last. */
export function rolesForTurn(turn, startTurn, lastArchitect) {
  const architect = (turn === startTurn && lastArchitect)
    ? (lastArchitect === "claude" ? "codex" : "claude")
    : (turn % 2 ? "claude" : "codex");
  return { architect, doer: architect === "claude" ? "codex" : "claude" };
}

// ------------------------------------------------------------- preflight ----

function preflight() {
  say("── preflight ─────────────────────────────────────────");

  const dirty = git(["status", "--porcelain"]);
  if (dirty) {
    say("  working tree is not clean:");
    say(dirty.split("\n").map((l) => `      ${l}`).join("\n"));
    fail("Commit or stash first. Failed turns revert with `git reset --hard`, which would take your work with it.");
  }
  say("  working tree clean");

  // A linked worktree keeps `.git` as a file. Refuse rather than warn: the
  // rollback design assumes nothing in this checkout is precious.
  const isLinkedWorktree = existsSync(".git") && !existsSync(".git/HEAD");
  if (!isLinkedWorktree && !ALLOW_PRIMARY) {
    fail("Run this in a dedicated linked worktree, not the primary checkout.\n" +
         "         git worktree add ../anadyon-agent-run\n" +
         "         (--allow-primary overrides, but a failed turn then resets the copy you are using)");
  }
  say(`  checkout: ${isLinkedWorktree ? "linked worktree" : "primary (overridden)"}`);

  const ex = excludePath();
  say(`  exclude file: ${ex}`);
  if (!DRY_RUN) {
    const current = existsSync(ex) ? readFileSync(ex, "utf8") : "";
    if (!current.includes(TURN_SPEC)) appendFileSync(ex, `\n${TURN_SPEC}\n`);
    if (!readFileSync(ex, "utf8").includes(TURN_SPEC)) {
      fail(`Could not exclude ${TURN_SPEC} via ${ex}. --continue would refuse on a dirty tree.`);
    }
    say(`  ${TURN_SPEC} excluded`);
  }

  for (const [name, spec] of Object.entries(AGENTS)) {
    try { execFileSync("which", [spec.bin], { stdio: "ignore" }); }
    catch { fail(`${name}: \`${spec.bin}\` is not on PATH.`); }
    if (DRY_RUN) { say(`  ${name}: on PATH (dry-run — invocation not exercised)`); continue; }
    try {
      execFileSync(spec.bin, spec.args("Reply with the single word OK. Change nothing."),
        { stdio: "ignore", timeout: 120_000 });
      say(`  ${name}: invocation works — ${spec.bin} ${spec.args("…").join(" ")}`);
    } catch (err) {
      fail(`${name}: the real invocation failed before any work started.\n` +
           `         tried: ${spec.bin} ${spec.args("…").join(" ")}\n` +
           `         ${String(err.message).split("\n")[0]}\n` +
           `         Fix the argument array in AGENTS.`);
    }
  }

  if (!existsSync(BLUEPRINT)) fail(`${BLUEPRINT} is missing — the architect has nowhere to write.`);
  say(`  ${BLUEPRINT} present`);
  say("");
}

// -------------------------------------------------------------- agent io ----

/**
 * Streams the agent's output AND captures it. execFileSync cannot do both:
 * stdio:"inherit" shows the work but returns nothing, so limit detection had
 * nothing to match on and never fired. A silent loop is also indistinguishable
 * from a hung one, so neither half is optional.
 */
function runAgent(name, prompt) {
  if (limited[name]) return Promise.resolve({ ok: false, limit: true, out: "already limited", agent: null });
  const spec = AGENTS[name];

  if (DRY_RUN) {
    say(`  [dry-run] ${spec.bin} ${spec.args("<prompt>").join(" ")}`);
    return Promise.resolve({ ok: true, limit: false, out: "", agent: name });
  }

  return new Promise((resolve) => {
    const child = spawn(spec.bin, spec.args(prompt), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const tee = (chunk) => { out += chunk; process.stdout.write(chunk); };
    child.stdout.on("data", tee);
    child.stderr.on("data", tee);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      say(`\n  ${name} timed out after ${AGENT_TIMEOUT_MS / 60000} minutes`);
    }, AGENT_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true, limit: false, out, agent: name });
      const isLimit = LIMIT_PATTERNS.some((re) => re.test(out));
      if (isLimit) { limited[name] = true; say(`\n  ${name} hit its limit`); }
      resolve({ ok: false, limit: isLimit, out, agent: null });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, limit: false, out: String(err.message), agent: null });
    });
  });
}

/** Returns the agent that ACTUALLY ran, so commits record fact, not intent. */
async function runWithFailover(preferred, prompt) {
  const other = preferred === "claude" ? "codex" : "claude";
  let r = await runAgent(preferred, prompt);
  if (r.ok) return r;
  if (r.limit && !limited[other]) {
    say(`  handing over to ${other}`);
    r = await runAgent(other, prompt);
    if (r.ok) return r;
  }
  return { ...r, agent: null };
}

// --------------------------------------------------------------- verify -----

function verify() {
  for (const [bin, args] of VERIFY) {
    say(`  ${bin} ${args.join(" ")}`);
    try {
      // Measured here: tsc 14s, lint 9s, tests 21s, build 34s — 78s total.
      // Fifteen minutes per step is ~10x headroom.
      execFileSync(bin, args, { stdio: "inherit", timeout: 15 * 60 * 1000 });
    } catch {
      say(`  FAILED: ${bin} ${args.join(" ")}`);
      return false;
    }
  }
  return true;
}

/** Everything the agents touched, back to a known commit — including untracked
 *  files, which `git checkout -- .` leaves behind. */
function rollback(to) {
  git(["reset", "--hard", to]);
  git(["clean", "-fd"]);
}

// ----------------------------------------------------------------- main -----

async function main() {
  const argv = process.argv.slice(2);
  let goal = argv
    .filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--turns" && argv[i - 1] !== "--base")
    .join(" ");
  if (!goal && !CONTINUE) fail('Say what to build:  node scripts/agent-loop.mjs "add stop-sells to the fleet screen"');

  preflight();

  let branch, startTurn = 1, lastArchitect = null;

  if (CONTINUE) {
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch.startsWith("codex/agent-loop-")) {
      fail(`--continue resumes an existing run, but HEAD is "${branch}".`);
    }
    const log = git(["log", "--format=%s%n%b", `${BASE}..HEAD`]);
    const turns = [...log.matchAll(/^Turn (\d+):/gm)].map((m) => Number(m[1]));
    startTurn = turns.length ? Math.max(...turns) + 1 : 1;
    lastArchitect = (log.match(/architect: (claude|codex)/) ?? [])[1] ?? null;
    goal ||= (log.match(/^Architecture for: (.+)$/m) ?? [])[1]
          ?? (log.match(/^Turn \d+: (.+)$/m) ?? [])[1] ?? "";
    if (!goal) fail("Could not recover the goal from this branch. Pass it again.");
    say(`resuming ${branch}\ngoal:   ${goal}\nnext turn: ${startTurn}${lastArchitect ? `  (last architect: ${lastArchitect})` : ""}\n`);
  } else {
    try { git(["rev-parse", "--verify", BASE]); }
    catch { fail(`Base "${BASE}" does not exist. Fetch it, or pass --base.`); }
    branch = `codex/agent-loop-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
    if (DRY_RUN) {
      say(`[dry-run] would branch ${branch} from ${BASE} @ ${git(["rev-parse", "--short", BASE])}\n`);
    } else {
      git(["checkout", "-b", branch, BASE]);
      say(`branch: ${branch}  (from ${BASE} @ ${git(["rev-parse", "--short", BASE])})\ngoal:   ${goal}\n`);
    }
  }

  const baseSha = DRY_RUN ? null : git(["rev-parse", "HEAD"]);

  // ---- phase 1: architecture ----
  if (!CONTINUE) {
    say("── phase 1: architecture ─────────────────────────────");
    const drafted = await runWithFailover("claude", [
      `You are the ARCHITECT. Read AGENTS.md, then docs/README.md.`,
      `Goal: ${goal}`,
      `Check whether ${BLUEPRINT} already answers it — DEFINING-STATEMENTS.md §9.`,
      `Write your decision as a section in ${BLUEPRINT}: scope, reasoning, deliberate exclusions.`,
      `Edit ONLY ${BLUEPRINT}. Do not write application code.`,
    ].join("\n"));
    if (!drafted.agent) { if (!DRY_RUN) rollback(baseSha); fail("Neither agent could draft. Nothing changed."); }

    await runWithFailover(drafted.agent === "claude" ? "codex" : "claude", [
      `You are REVIEWING the architecture decision just added to ${BLUEPRINT}.`,
      `Goal: ${goal}`,
      `Engage with the reasoning recorded there rather than restating the topic.`,
      `Append your review to the same section. Edit ONLY ${BLUEPRINT}.`,
    ].join("\n"));

    if (!DRY_RUN) {
      const touched = git(["status", "--porcelain"]).split("\n").filter(Boolean)
        .map((l) => l.slice(3)).filter((f) => f !== BLUEPRINT);
      if (touched.length) {
        say(`\n  architect phase changed files outside ${BLUEPRINT}:`);
        touched.forEach((f) => say(`      ${f}`));
        rollback(baseSha);
        fail("The architecture phase must edit only the blueprint. Rolled back.");
      }

      say(`\n── proposed ──────────────────────────────────────────`);
      say(git(["diff", "--", BLUEPRINT]));   // the whole diff, never a slice

      const answer = await ask("\nApprove this and start building? (yes/no) ");
      if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
        rollback(baseSha);
        git(["checkout", "--detach", BASE]);
        git(["branch", "-D", branch]);
        say("Rejected. Branch deleted, tree restored.");
        process.exit(0);
      }
      git(["add", BLUEPRINT]);
      git(["commit", "-m", `Architecture for: ${goal}`]);
      say("\nApproved and committed.\n");
    }
  }

  // ---- phase 2: build turns ----
  const endTurn = startTurn + MAX_TURNS - 1;
  for (let turn = startTurn; turn <= endTurn; turn++) {
    say(`\n── turn ${turn} ──────────────────────────────────────────`);
    if (limited.claude && limited.codex) { say("Both agents limited. Stopping."); break; }
    if (existsSync(TURN_SPEC) && Buffer.byteLength(readFileSync(TURN_SPEC)) > MAX_SPEC_BYTES) {
      say(`${TURN_SPEC} exceeds ${MAX_SPEC_BYTES} bytes. Stopping.`); break;
    }

    const { architect, doer } = rolesForTurn(turn, startTurn, lastArchitect);
    say(`architect: ${architect}   implementer: ${doer}`);

    const turnStart = DRY_RUN ? null : git(["rev-parse", "HEAD"]);
    if (!DRY_RUN) writeFileSync(TURN_SPEC, `# Turn ${turn}\n\nGoal: ${goal}\n`);

    const archStep = await runWithFailover(architect, [
      `You are the ARCHITECT for turn ${turn}. Read ${BLUEPRINT} and any failing output from the last turn.`,
      `Write the next concrete step into ${TURN_SPEC}. One step, small enough to verify.`,
      `If the blueprint is wrong or silent, say so there and stop — do not redesign mid-branch.`,
    ].join("\n"));
    if (!archStep.agent) { say("No architect available. Stopping."); break; }

    const buildStep = await runWithFailover(doer, [
      `You are the IMPLEMENTER for turn ${turn}. Read ${TURN_SPEC} and build exactly that.`,
      `A new regression test must be run against the unfixed code and seen to FAIL before you trust it.`,
      `Never apply a Supabase migration. Write the numbered migration and its byte-identical paste copy.`,
    ].join("\n"));
    if (!buildStep.agent) { say("No implementer available. Stopping."); break; }

    if (DRY_RUN) { say("[dry-run] verification and commit skipped"); continue; }

    say("\n── verify ────────────────────────────────────────────");
    if (verify()) {
      git(["add", "-A"]);
      git(["reset", "--", TURN_SPEC]);
      if (git(["diff", "--cached", "--stat"])) {
        git(["commit", "-m",
          `Turn ${turn}: ${goal}\n\narchitect: ${archStep.agent}\nimplementer: ${buildStep.agent}`]);
        say(`\nTurn ${turn} committed.`);
      } else say(`\nTurn ${turn} produced no changes.`);
    } else {
      say(`\nTurn ${turn} failed verification. Reverting to ${turnStart.slice(0, 7)}.`);
      rollback(turnStart);
    }
  }

  if (!DRY_RUN && existsSync(TURN_SPEC)) rmSync(TURN_SPEC, { force: true });

  say(`\n── done ──────────────────────────────────────────────`);
  if (DRY_RUN) { say("dry run — nothing was created, branched or committed."); return; }
  say(`branch ${branch} — nothing was pushed.`);
  say(git(["log", "--oneline", `${BASE}..HEAD`]));
  say(`\n  node scripts/agent-loop.mjs --continue     next turn, roles swap`);
}

// Only run when invoked directly, so the tests can import the pure helpers.
if (process.argv[1] && process.argv[1].endsWith("agent-loop.mjs")) {
  main().catch((e) => fail(e.message));
}
