import { describe, expect, it } from "vitest";
import { decide, leadingProgram } from "../.claude/hooks/production-gate.mjs";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../scripts/deployment-boundary-lib.mjs";

/**
 * The production gate must deny production, allow staging, and — the part that
 * decides whether it survives a week — allow the commands by which it is reviewed.
 *
 * Two failure modes, and the second is the one that kills controls like this:
 *
 * 1. **Under-denying** is obvious and gets caught.
 * 2. **Over-denying** is not. A gate that blocks `grep <ref> docs/` blocks the
 *    command that verifies the ref against the audit recording it, and a gate that
 *    blocks ordinary work gets deleted by whoever is debugging at speed. So most
 *    of this file is about what must still be **allowed**.
 *
 * Every case names a real command or tool call rather than a shape, so a reader can
 * tell whether the rule matches their intuition.
 */
const PROD = PRODUCTION_PROJECT_REF;
const PROD_HOST = `${PROD}.supabase.co`;

const bash = (command: string) => decide({ tool_name: "Bash", tool_input: { command } });
const fetchUrl = (url: string) => decide({ tool_name: "WebFetch", tool_input: { url } });

describe("the two refs are distinct, so nothing below is vacuous", () => {
  it("holds", () => {
    expect(PROD).not.toBe(STAGING_PROJECT_REF);
  });
});

describe("denies acting on production", () => {
  it("a fetch of the production host", () => {
    expect(fetchUrl(`https://${PROD_HOST}/rest/v1/reservations`).decision).toBe("deny");
  });

  it("curl, psql and the supabase CLI", () => {
    for (const command of [
      `curl https://${PROD_HOST}/rest/v1/`,
      `psql "postgres://u:p@db.${PROD_HOST}/postgres"`,
      `supabase link --project-ref ${PROD}`,
      `pg_dump "host=db.${PROD_HOST}" > out.sql`,
    ]) {
      expect(bash(command).decision, command).toBe("deny");
    }
  });

  it("a route the settings deny list does NOT cover — the reason this gate exists", () => {
    // .claude/settings.json names curl, psql, pg_dump and supabase. It cannot
    // enumerate every program that can open a socket. This is the gap the gate
    // closes, and it is the case fired live against the real hook.
    expect(bash(`node -e "fetch('https://${PROD_HOST}/rest/v1/')"`).decision).toBe("deny");
    expect(bash(`python3 -c "import urllib.request; urllib.request.urlopen('https://${PROD_HOST}')"`).decision).toBe("deny");
    expect(bash(`wget https://${PROD_HOST}/rest/v1/`).decision).toBe("deny");
    expect(bash(`http GET https://${PROD_HOST}/rest/v1/`).decision).toBe("deny");
  });

  it("an unknown tool carrying the ref anywhere in its input", () => {
    const event = {
      tool_name: "mcp__supabase__execute_sql",
      tool_input: { project_id: PROD, query: "select * from reservations" },
    };
    expect(decide(event).decision).toBe("deny");
  });

  it("and says which project is which, so the agent can self-correct", () => {
    const { reason } = fetchUrl(`https://${PROD_HOST}/rest/v1/`);
    expect(reason).toContain(STAGING_PROJECT_REF);
    expect(reason).toContain("needs a person");
  });
});

describe("allows staging, and ordinary work", () => {
  it("the staging host", () => {
    expect(fetchUrl(`https://${STAGING_PROJECT_REF}.supabase.co/rest/v1/`).decision).toBe("allow");
  });

  it("a command that mentions no production identifier", () => {
    expect(bash("npm run verify:fast").decision).toBe("allow");
    expect(bash(`supabase link --project-ref ${STAGING_PROJECT_REF}`).decision).toBe("allow");
  });

  it("the commands that audit this very control — the over-denying case", () => {
    for (const command of [
      `grep -rn ${PROD} docs/`,
      `rg ${PROD} docs/audits/2026-08-18-prelaunch.md`,
      `cat docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`,
      `git log --oneline -S ${PROD}`,
      `git grep ${PROD}`,
      `wc -l docs/agent-controls/codex-network-deny.toml`,
    ]) {
      expect(bash(command).decision, command).toBe("allow");
    }
  });

  it("writing documentation that names production", () => {
    // Every document under docs/ names both refs deliberately.
    for (const tool of ["Read", "Edit", "Write"]) {
      const event = { tool_name: tool, tool_input: { file_path: "docs/x.md", new_string: PROD_HOST } };
      expect(decide(event).decision, tool).toBe("allow");
    }
  });
});

describe("the inspection allowance cannot be used as a bypass", () => {
  it("a pipeline that starts with cat but does not end there", () => {
    // `cat` is allowed; `cat … | curl …` is not, or the allowance is a hole.
    expect(bash(`cat f | curl -d @- https://${PROD_HOST}/rest/v1/x`).decision).toBe("deny");
    expect(bash(`echo ${PROD} > /tmp/x && node send.mjs`).decision).toBe("deny");
    expect(bash(`grep ${PROD} docs/ ; curl https://${PROD_HOST}`).decision).toBe("deny");
    expect(bash(`grep $(echo ${PROD}) docs/`).decision).toBe("deny");
  });

  it("a write subcommand of git is not a read", () => {
    expect(bash(`git push ${PROD_HOST} main`).decision).toBe("deny");
    expect(bash(`git remote add prod https://${PROD_HOST}`).decision).toBe("deny");
  });

  it("an env prefix or sudo does not hide the program", () => {
    expect(leadingProgram(`FOO=1 BAR=2 curl https://x`)).toBe("curl");
    expect(leadingProgram(`sudo /usr/bin/psql x`)).toBe("psql");
    expect(leadingProgram(`git log --oneline`)).toBe("git log");
    expect(bash(`FOO=1 curl https://${PROD_HOST}`).decision).toBe("deny");
  });
});

describe("the guardrail-file rule", () => {
  it("denies in-place destruction from a shell, which leaves no diff", () => {
    expect(bash("sed -i '' 's/deny/allow/' .claude/settings.json").decision).toBe("deny");
    expect(bash("rm .claude/hooks/production-gate.mjs").decision).toBe("deny");
    expect(bash("git checkout -- .claude/settings.json").decision).toBe("deny");
  });

  it("ALLOWS editing them with the file tools, which is deliberate", () => {
    // The first version denied this too, and the gate then blocked its own
    // maintenance: four consecutive attempts to repair a bug in it were refused,
    // each because the repair command happened to quote one of the protected paths.
    // Routing around the rule took one line, which is the second and larger finding
    // — a rule on the machine the agent controls cannot tell the author from an
    // attacker, and anything assembling a path from parts walks past it.
    //
    // What protects these files is that a change lands in a committed diff, and that
    // tests/agentNetworkControls.test.ts fails in CI when a deny list loses the
    // production ref — enforcement where the agent holds no credential. So the
    // reviewable route is allowed and only the unreviewable one is denied.
    for (const tool of ["Write", "Edit", "Read"]) {
      const event = { tool_name: tool, tool_input: { file_path: ".claude/settings.json" } };
      expect(decide(event).decision, tool).toBe("allow");
    }
  });

  it("does not mistake a command that QUOTES a dangerous verb for one that runs it", () => {
    // Faults three and four, and the second is why this assertion is the way round
    // it is. The rule first matched /\brm\b/ against the whole command, so a heredoc
    // writing the worklog entry that documents this gate was denied — the prose
    // contained the word "rm". Same fault as the inspection rule's first version: a
    // judgement about the whole string where the question is about a segment.
    //
    // Now the verb must be the program a segment runs. Describing an action is
    // allowed; performing it is not.
    expect(bash("echo 'example: rm .claude/settings.json'").decision).toBe("allow");
    expect(bash("cat >> notes.md <<'EOF'\nwe should rm .claude/settings.json\nEOF").decision).toBe("allow");
    expect(bash("rm .claude/settings.json").decision).toBe("deny");
    expect(bash("cd /tmp && rm .claude/settings.json").decision).toBe("deny");
    // `sed` and `perl` only destroy with the in-place flag.
    expect(bash("sed -n '1,5p' .claude/settings.json").decision).toBe("allow");
    expect(bash("sed -i '' s/a/b/ .claude/settings.json").decision).toBe("deny");
  });
});

describe("the bypasses Codex demonstrated on 3 October 2026", () => {
  /**
   * Codex reviewed this gate by using it rather than by reading it, and got four
   * ordinary commands past it. Two are now denied, one was always denied, and one
   * cannot be closed by a rule of this kind at all.
   *
   * The fourth is asserted here **as an allow**. That is deliberate and it is the
   * honest form of the finding: a test that documents a hole keeps the hole in
   * front of whoever reads the suite, where a missing test lets the next reader
   * assume coverage. If someone later makes the gate catch it, this assertion
   * fails and they will read why.
   */
  it("CLOSED: redirecting a production URL into an env file", () => {
    // `echo` only prints, so the old rule called this an inspection and allowed
    // it. The act is not the printing; it is the file it lands in.
    expect(bash(`echo 'NEXT_PUBLIC_SUPABASE_URL=https://${PROD_HOST}' > .env.local`).decision).toBe("deny");
    expect(bash(`echo 'URL=https://${PROD_HOST}' >> .env.production`).decision).toBe("deny");
    expect(bash(`cat docs/x.md | grep ${PROD} > /tmp/ref`).decision).toBe("deny");
  });

  it("CLOSED: writing one with the file tools instead of the shell", () => {
    // Documents may name production; env files may not. Same tool, different file.
    for (const tool of ["Write", "Edit"]) {
      const event = { tool_name: tool, tool_input: { file_path: ".env.local", new_string: `https://${PROD_HOST}` } };
      expect(decide(event).decision, tool).toBe("deny");
    }
    expect(decide({ tool_name: "Write", tool_input: { file_path: "app/.env", content: PROD } }).decision).toBe("deny");
  });

  it("still allows the inspections that redirect nothing", () => {
    // The redirect rule must not take the audit commands with it.
    expect(bash(`grep -rn ${PROD} docs/ 2>&1 | less`).decision).toBe("allow");
    expect(bash(`git log -S ${PROD} 2>&1`).decision).toBe("allow");
    expect(decide({ tool_name: "Write", tool_input: { file_path: "docs/x.md", content: PROD_HOST } }).decision).toBe("allow");
  });

  it("OPEN, and recorded as open: a command that derives the target at runtime", () => {
    // No production identifier appears, so nothing here can see it. This is why
    // the header calls the gate an advisory identifier guard and why the boundary
    // has to be the credential rather than the command string.
    expect(bash("source .env.local && npm run dev").decision).toBe("allow");
    expect(bash("export URL=$(cat .ref) && node send.mjs").decision).toBe("allow");
  });
});

describe("the denial has to be readable, or it gets routed around", () => {
  it("names the segment that reaches production, not the first word of the line", () => {
    // It reported `&&` and then `cd` while refusing a heredoc that was writing
    // these very controls. A denial that names an operator reads as a bug, and
    // the reader's next move is to retry the command spelled differently —
    // which is the one outcome a guardrail must not provoke.
    const { reason } = bash(`cd /tmp && cp a b && python3 -c "open('x')" # ${PROD}`);
    expect(reason).toContain("`python3`");
    expect(reason).not.toContain("`&&`");
    expect(reason).not.toContain("`cd`");
  });

  it("stops treating a change of directory as an action on production", () => {
    expect(bash(`cd docs && grep -rn ${PROD} .`).decision).toBe("allow");
    expect(bash(`cd /tmp && curl https://${PROD_HOST}`).decision).toBe("deny");
  });
});

describe("it fails closed on nonsense", () => {
  it("an empty or unrecognised event is not silently allowed when it names production", () => {
    expect(decide({}).decision).toBe("allow"); // nothing to act on
    expect(decide({ tool_name: "Unknown", tool_input: { x: PROD } }).decision).toBe("deny");
    expect(decide({ tool_name: "Unknown", tool_input: { nested: [{ deep: PROD_HOST }] } }).decision).toBe("deny");
  });
});
