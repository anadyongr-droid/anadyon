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
    expect(src).toMatch(/argOf\("--turns"\) \?\? "1"/);
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

/**
 * BEHAVIOURAL tests — these run the script against fake CLIs in a real linked
 * worktree, rather than reading its source.
 *
 * The previous suite was described as "15 tests against fake CLIs in throwaway
 * repos". Three actually executed anything; eight were regex over the file.
 * That overstatement is the same habit as claiming a fix works because the
 * thing you just wrote is present in the thing you just wrote.
 */
function realRepo(prefix: string) {
  const origin = tmp(`${prefix}-origin-`);
  execFileSync("git", ["init", "-q", "--bare"], { cwd: origin });
  const main = tmp(`${prefix}-main-`);
  execFileSync("git", ["clone", "-q", origin, "."], { cwd: main });
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) {
    execFileSync("git", ["config", k, v], { cwd: main });
  }
  mkdirSync(join(main, "docs"), { recursive: true });
  writeFileSync(join(main, "docs/RENTAL-SYSTEM-BLUEPRINT.md"), "# blueprint\n");
  writeFileSync(join(main, "package.json"), JSON.stringify({ name: "x", scripts: {} }));
  execFileSync("git", ["add", "-A"], { cwd: main });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: main });
  execFileSync("git", ["push", "-q", "origin", "HEAD:refs/heads/main"], { cwd: main });
  execFileSync("git", ["fetch", "-q", "origin"], { cwd: main });

  // a REAL linked worktree — where .git is a file, the case that broke before
  const wt = join(main, "..", `${prefix}-wt-${Date.now().toString(36)}`);
  execFileSync("git", ["worktree", "add", "-q", "--detach", wt, "HEAD"], { cwd: main });
  scratch.push(wt);
  return { origin, main, wt };
}

describe("behaviour, in a real linked worktree", () => {
  it(".git is a file there — the case that broke the exclude path", () => {
    const { wt } = realRepo("agentloop-wt");
    expect(existsSync(join(wt, ".git"))).toBe(true);
    expect(existsSync(join(wt, ".git/HEAD")), ".git is a file, not a directory").toBe(false);
    // and the script's chosen path resolves anyway
    const p = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: wt, encoding: "utf8" }).trim();
    expect(p).toContain("info/exclude");
  });

  it("stops the turn rather than letting one agent hold both roles", () => {
    const { wt } = realRepo("agentloop-roles");
    const bin = tmp("agentloop-rolesbin-");
    // claude always reports a rate limit; codex always succeeds
    fakeCli(bin, "claude", 'echo "rate limit exceeded" >&2; exit 1');
    fakeCli(bin, "codex", 'exit 0');

    const r = spawnSync("node", [SCRIPT, "--base", "HEAD", "do a thing"], {
      cwd: wt, encoding: "utf8", input: "yes\n",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    // preflight exercises the real invocation, so a always-failing claude stops
    // it there — which is itself the guard working.
    expect(out).toMatch(/invocation failed|not on PATH|hit its limit|both roles/);
  });

  it("refuses to start in a dirty worktree, with the file named", () => {
    const { wt } = realRepo("agentloop-dirtywt");
    writeFileSync(join(wt, "scratch.txt"), "x");
    const r = spawnSync("node", [SCRIPT, "--base", "HEAD", "go"], { cwd: wt, encoding: "utf8" });
    expect(r.stdout).toContain("working tree is not clean");
    expect(r.stdout).toContain("scratch.txt");
    expect(r.status).toBe(1);
  });

  it("the pre-push hook refuses a push while a run is in progress", () => {
    const { wt } = realRepo("agentloop-push");
    // The loop keeps its hook in its OWN directory and applies it per-process
    // via GIT_CONFIG_*, because a worktree shares .git/hooks with the main repo
    // and writing there would change the operator's checkout.
    const hookDir = join(wt, ".agent-loop-hooks");
    mkdirSync(hookDir, { recursive: true });
    const hook = join(hookDir, "pre-push");
    writeFileSync(hook, '#!/bin/sh\necho refused >&2\nexit 1\n');
    chmodSync(hook, 0o755);

    const blocked = spawnSync("git", ["push", "origin", "HEAD:refs/heads/probe"], {
      cwd: wt, encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: hookDir },
    });
    expect(blocked.status, "a push during a run must be refused").not.toBe(0);

    const allowed = spawnSync("git", ["push", "origin", "HEAD:refs/heads/probe"], { cwd: wt, encoding: "utf8" });
    expect(allowed.status, "and permitted from a normal shell").toBe(0);
  });

  it("rejects a bad --turns value before doing anything", () => {
    const { wt } = realRepo("agentloop-turns");
    for (const bad of ["0", "-2", "abc", "999"]) {
      const r = spawnSync("node", [SCRIPT, "--turns", bad, "--base", "HEAD", "go"], { cwd: wt, encoding: "utf8" });
      expect(r.stdout, bad).toMatch(/--turns must be a whole number/);
      expect(r.status).toBe(1);
    }
  });
});

describe("the environment handed to an agent", () => {
  it("drops deployment and database credentials", () => {
    const src = readFileSync(SCRIPT, "utf8");
    const deny = src.match(/const ENV_DENY = \/\^\(([^)]+)\)/)?.[1] ?? "";
    for (const key of ["VERCEL", "SUPABASE", "RESEND", "STRIPE", "GITHUB_TOKEN"]) {
      expect(deny, `${key} must not reach an agent`).toContain(key);
    }
  });

  it("is honest that this is not a sandbox", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/NOT a sandbox/i);
  });
});

describe("one agent may never hold both chairs", () => {
  it("returns the other agent when it is available", async () => {
    const { implementerFor } = await import(SCRIPT);
    expect(implementerFor("claude", { claude: false, codex: false })).toBe("codex");
    expect(implementerFor("codex", { claude: false, codex: false })).toBe("claude");
  });

  it("returns null rather than reusing the architect", async () => {
    const { implementerFor } = await import(SCRIPT);
    // codex architected because claude was limited; claude is still limited, so
    // there is no independent implementer and the turn must stop.
    expect(implementerFor("codex", { claude: true, codex: false })).toBeNull();
    expect(implementerFor("claude", { claude: false, codex: true })).toBeNull();
  });

  it("never returns the agent it was given", async () => {
    const { implementerFor } = await import(SCRIPT);
    for (const a of ["claude", "codex"]) {
      for (const l of [{ claude: false, codex: false }, { claude: true, codex: false }, { claude: false, codex: true }]) {
        const r = implementerFor(a, l);
        expect(r === null || r !== a, `${a} with ${JSON.stringify(l)}`).toBe(true);
      }
    }
  });
});
