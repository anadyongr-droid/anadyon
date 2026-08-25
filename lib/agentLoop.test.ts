import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The loop itself, exercised against FAKE agent CLIs in a throwaway repo.
 *
 * Green CI proves the application still builds. It proves nothing about this
 * script, and the script is the thing that will be pointed at a real codebase
 * with real credentials. Every assertion below corresponds to a defect found in
 * review rather than to a feature someone imagined:
 *
 *   stdio:"inherit" streamed output but captured none, so the rate-limit
 *   patterns had nothing to match and failover was dead code;
 *   ".git/info/exclude" is ENOTDIR in a linked worktree, which left the scratch
 *   spec untracked and blocked the next --continue on a dirty tree;
 *   the commit recorded the INTENDED architect, so --continue read back the
 *   wrong one and the alternation it protects silently collapsed.
 */

const SCRIPT = join(process.cwd(), "scripts/agent-loop.mjs");
const scratch: string[] = [];

function tmp(prefix: string) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(d);
  return d;
}
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

/** A stand-in CLI that behaves however a test needs it to. */
function fakeCli(dir: string, name: string, body: string) {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

function run(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd, encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// ---------------------------------------------------------------------------

describe("preflight refuses unsafe starts", () => {
  it("stops on a dirty tree, and names the files", () => {
    const repo = tmp("agentloop-dirty-");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, "untracked.txt"), "x");

    const r = run(repo, ["build something"]);
    expect(r.stdout).toContain("working tree is not clean");
    expect(r.stdout).toContain("untracked.txt");
    expect(r.status).toBe(1);
  });

  it("stops when a CLI is absent, before touching anything", () => {
    const repo = tmp("agentloop-nocli-");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    // Keep node reachable — stripping PATH entirely means the script never
    // runs and the test proves nothing. Only the agent CLIs must be absent.
    const nodeDir = join(process.execPath, "..");
    // --allow-primary because a fresh `git init` is not a linked worktree, and
    // that guard fires first — the test would otherwise stop before reaching
    // the check it is about.
    const r = run(repo, ["--allow-primary", "build something"], { PATH: `${nodeDir}:/usr/bin:/bin` });
    expect(r.stdout ?? "").toMatch(/is not on PATH/);
    expect(r.status).toBe(1);
  });
});

describe("the failures found in review", () => {
  it("captures agent output — otherwise limit detection can never fire", () => {
    // The original used stdio:"inherit". This asserts the property that broke:
    // a failing child's output must be readable by the parent.
    const inherit = spawnSync("node",
      ["-e", 'try{require("child_process").execFileSync("node",["-e","console.error(\'rate limit\');process.exit(1)"],{stdio:"inherit"})}catch(e){process.stdout.write(String((e.stderr??"")+(e.stdout??"")))}'],
      { encoding: "utf8" });
    expect(inherit.stdout, "inherit captures nothing — this is the bug").toBe("");

    const piped = spawnSync("node", ["-e", 'console.error("rate limit"); process.exit(1)'], { encoding: "utf8" });
    expect(piped.stderr).toContain("rate limit");
  });

  it("uses the real exclude path, which differs in a linked worktree", () => {
    // Strip comments first: the header explains the ENOTDIR trap and would
    // otherwise be matched as though it were code. Exactly the mistake that
    // made an earlier CSS assertion fail on its own documentation.
    const code = readFileSync(SCRIPT, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, "hard-coding .git/info/exclude is ENOTDIR in a worktree")
      .not.toMatch(/["']\.git\/info\/exclude["']/);
    expect(code).toMatch(/rev-parse", "--git-path", "info\/exclude"/);
  });

  it("commits the agent that actually ran, not the one intended", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/architect: \$\{archStep\.agent\}/);
    expect(src, "recording intent corrupts what --continue reads back")
      .not.toMatch(/architect: \$\{architect\}\\nimplementer/);
  });

  it("defaults to one turn, not four", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/MAX_TURNS = Number\(argOf\("--turns"\) \?\? 1\)/);
  });

  it("refuses the primary checkout rather than warning", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/dedicated linked worktree/);
    expect(src).toMatch(/ALLOW_PRIMARY/);
  });

  it("branches from an explicit verified base", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/rev-parse", "--verify", BASE/);
    expect(src).toMatch(/checkout", "-b", branch, BASE/);
  });

  it("shows the whole architecture diff, never a slice", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src, "truncating the approval diff hides changes")
      .not.toMatch(/\.slice\(0,\s*8000\)/);
  });

  it("rollback removes untracked files too", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/function rollback[\s\S]{0,160}clean", "-fd"/);
  });

  it("rejects an architecture phase that edits anything but the blueprint", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/must edit only the blueprint/i);
  });
});

describe("role alternation", () => {
  it("does not hand the same agent the same chair on a resumed run", async () => {
    const { rolesForTurn } = await import(SCRIPT);
    // turn 3 resuming after codex was architect on turn 2
    expect(rolesForTurn(3, 3, "codex").architect).toBe("claude");
    expect(rolesForTurn(3, 3, "claude").architect).toBe("codex");
    // and the two roles are never the same agent
    for (let t = 1; t <= 6; t++) {
      const { architect, doer } = rolesForTurn(t, 1, null);
      expect(architect).not.toBe(doer);
    }
  });
});

describe("limit patterns", () => {
  it("match real limit responses", async () => {
    const { LIMIT_PATTERNS } = await import(SCRIPT);
    const real = ["rate limit exceeded", "HTTP 429 Too Many Requests",
                  "usage limit reached", "insufficient_quota", "your credit balance is too low"];
    for (const line of real) {
      expect(LIMIT_PATTERNS.some((re: RegExp) => re.test(line)), line).toBe(true);
    }
  });

  it("do not fire on ordinary output that mentions quota", async () => {
    const { LIMIT_PATTERNS } = await import(SCRIPT);
    // A test named "quota" in the suite output must not kill an agent for the run.
    const innocuous = ["✓ enforces the storage quota", "quota.test.ts passed", "429 rows updated"];
    for (const line of innocuous) {
      expect(LIMIT_PATTERNS.some((re: RegExp) => re.test(line)), line).toBe(false);
    }
  });
});

describe("dry run mutates nothing", () => {
  it("creates no branch and no commit", () => {
    const repo = tmp("agentloop-dry-");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs/RENTAL-SYSTEM-BLUEPRINT.md"), "# bp\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: repo });

    const bin = tmp("agentloop-bin-");
    fakeCli(bin, "claude", 'echo ok');
    fakeCli(bin, "codex", 'echo ok');

    const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const branchesBefore = execFileSync("git", ["branch"], { cwd: repo, encoding: "utf8" });

    run(repo, ["--dry-run", "--allow-primary", "--base", "HEAD", "do a thing"],
        { PATH: `${bin}:${process.env.PATH}` });

    const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    expect(after).toBe(before);
    expect(execFileSync("git", ["branch"], { cwd: repo, encoding: "utf8" })).toBe(branchesBefore);
    expect(existsSync(join(repo, ".agent-turn-spec.md"))).toBe(false);
  });
});
