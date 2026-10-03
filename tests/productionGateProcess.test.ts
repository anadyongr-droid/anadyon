import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../scripts/deployment-boundary-lib.mjs";

/**
 * The gate run as a **process**, the way both agents run it.
 *
 * `tests/productionGate.test.ts` calls `decide()`, which is the right place to
 * test the policy and the wrong place to learn whether the hook works. A hook is
 * an executable with a contract — read JSON on stdin, answer on stdout, stderr
 * and an exit code — and every wiring fault lives outside `decide()`: a broken
 * shebang, an import that fails at load, a decision that never reaches an exit
 * code, output on the stream the host does not read.
 *
 * **That gap is not hypothetical here.** On 3 October 2026 the escalation branch
 * answered `permissionDecision: "ask"`, which Claude Code honours and Codex
 * *parses, reports as a hook error, and then continues the call* — so the one
 * path written to be careful was the one path that failed open, on the agent
 * that holds the browser. No unit test could have seen it, because the fault was
 * in which signal the decision was expressed as, not in the decision.
 *
 * So each case below asserts the whole contract:
 *
 * - **deny** → the JSON on stdout (Claude Code), a reason on **stderr** (where
 *   Codex takes it from on a blocking exit), and **exit 2** (both document it as
 *   block);
 * - **allow** → **nothing on stdout** and exit 0, so the host's normal
 *   permission flow still applies. The gate narrows; it must never widen.
 *
 * The production ref is imported rather than written, so this file does not
 * carry the literal and the gate does not deny the editing of its own test.
 */
const GATE = join(process.cwd(), ".claude/hooks/production-gate.mjs");
const PROD_HOST = `${PRODUCTION_PROJECT_REF}.supabase.co`;
const LOG = join(mkdtempSync(join(tmpdir(), "gate-e2e-")), "decisions.jsonl");

function fire(raw: string): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(GATE, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PRODUCTION_GATE_LOG: LOG },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) => resolve({ out, err, code }));
    child.stdin.end(raw);
  });
}

const event = (tool: string, input: unknown) =>
  JSON.stringify({ session_id: "process-test", tool_name: tool, tool_input: input });

async function expectDeny(raw: string, label: string) {
  const { out, err, code } = await fire(raw);
  expect(JSON.parse(out).hookSpecificOutput, label).toMatchObject({
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
  });
  expect(err.trim(), `${label}: Codex reads the reason from stderr`).not.toBe("");
  expect(code, `${label}: both agents block on exit 2`).toBe(2);
}

async function expectAllow(raw: string, label: string) {
  const { out, code } = await fire(raw);
  expect(out.trim(), `${label}: an allow must write nothing, or it widens the host's own flow`).toBe("");
  expect(code, label).toBe(0);
}

describe("the gate, executed as the agents execute it", () => {
  it("denies production on all three signals at once", async () => {
    await expectDeny(event("Bash", { command: `curl https://${PROD_HOST}/rest/v1/reservations` }), "curl");
    await expectDeny(event("Bash", { command: `node -e "fetch('https://${PROD_HOST}')"` }), "node fetch");
    await expectDeny(event("WebFetch", { url: `https://${PROD_HOST}/rest/v1/` }), "WebFetch");
  });

  it("denies the two routes Codex got past it", async () => {
    await expectDeny(event("Bash", { command: `echo 'URL=https://${PROD_HOST}' > .env.local` }), "redirect");
    await expectDeny(event("Write", { file_path: ".env.local", content: `URL=https://${PROD_HOST}` }), "file tool");
  });

  it("denies unparseable input rather than escalating — the branch that failed open on Codex", async () => {
    await expectDeny("{not json", "malformed");
    const { out, code } = await fire("");
    // Empty stdin is a valid empty event, not a malformed one: nothing to act on.
    expect(out.trim()).toBe("");
    expect(code).toBe(0);
  });

  it("stays out of the way of staging, ordinary work and its own audit", async () => {
    await expectAllow(event("WebFetch", { url: `https://${STAGING_PROJECT_REF}.supabase.co/rest/v1/` }), "staging");
    await expectAllow(event("Bash", { command: "npm run verify:fast" }), "ordinary work");
    await expectAllow(event("Bash", { command: `grep -rn ${PRODUCTION_PROJECT_REF} docs/` }), "the audit grep");
    await expectAllow(event("Bash", { command: `grep -rn ${PRODUCTION_PROJECT_REF} docs/ 2>&1 | less` }), "audit grep, piped");
    await expectAllow(event("Write", { file_path: "docs/x.md", content: PROD_HOST }), "documentation");
  });

  it("records every decision, including the one it could not read", async () => {
    // A log of denials alone cannot distinguish "allowed it" from "never asked" —
    // which is precisely how W32 was misread. And the unparseable branch wrote
    // nothing at all until this test was run as a process.
    const lines = readFileSync(LOG, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.filter((line) => line.decision === "deny").length).toBeGreaterThan(5);
    expect(lines.filter((line) => line.decision === "allow").length).toBeGreaterThan(4);
    expect(
      lines.some((line) => line.decision === "deny" && /could not parse/.test(line.reason)),
      "the unparseable event left no record",
    ).toBe(true);
    for (const line of lines) expect(line.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
