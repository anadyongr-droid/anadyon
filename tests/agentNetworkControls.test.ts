import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_DENY_HOSTS,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../scripts/deployment-boundary-lib.mjs";

/**
 * The agent network controls must name production, and must not name staging.
 *
 * Two agents work in this repository and both can reach the internet. Neither
 * has any business touching the production Supabase project, and `AGENTS.md` is
 * blunt about why a written rule is not enough: *"A rule that matches command
 * strings is a reminder to the agent that wrote the command, not a control on
 * what the process can do."* So the control is a deny list the harness enforces,
 * and this test is what stops the deny list quietly going missing or wrong.
 *
 * **What each layer actually enforces, because they are not equal.**
 *
 * - `WebFetch(domain:…)` in `permissions.deny` is real: Claude Code refuses the
 *   fetch, and per the permissions reference the `domain:` form *also* feeds the
 *   sandbox's denied-domain list, so it strengthens by itself the day sandboxing
 *   is switched on.
 * - The `Bash(…)` entries are the speed bump `AGENTS.md` describes. They catch
 *   `curl https://<prod>` and `supabase link --project-ref <prod>` typed the
 *   obvious way, and they do not survive a shell variable or a rename. They are
 *   worth having and must not be mistaken for the boundary.
 * - The OS-level block needs `sandbox.enabled`, which is **deliberately not set
 *   here**: the sandbox's allowed-domain list starts empty, so turning it on
 *   repository-wide would break `npm ci` for every agent on the next run. That
 *   is a separate change with an allowlist to build first, not a one-liner.
 *
 * **The staging assertion is the one that matters most.** Denying the staging
 * ref by mistake — a transposed character, the wrong half of a copied pair —
 * would break every legitimate task while leaving production reachable. It would
 * look like a working control and be the exact opposite, and the person debugging
 * it at speed would most likely delete the whole block. So the wrong ref fails
 * loudly here instead.
 *
 * **Why the Bash patterns are not simply `*<ref>*`.** That form would also block
 * `grep -rn idfavwwfiuncoudkcfsp docs/`, which is how this control gets reviewed
 * and how the ref gets verified against the audit that records it. A control that
 * blocks its own audit is one nobody can check.
 */
const SETTINGS = ".claude/settings.json";
const CODEX_SNIPPET = "docs/agent-controls/codex-network-deny.toml";

type Settings = { permissions?: { deny?: string[]; allow?: string[] } };

function settings(): Settings {
  return JSON.parse(readFileSync(SETTINGS, "utf8")) as Settings;
}

function denyRules(): string[] {
  return settings().permissions?.deny ?? [];
}

describe("the production refs are distinct and documented", () => {
  it("names two different projects", () => {
    // Guards the whole file: if these ever collapse to one value, every
    // assertion below would pass while denying the environment we work in.
    expect(PRODUCTION_PROJECT_REF).not.toBe(STAGING_PROJECT_REF);
    expect(PRODUCTION_PROJECT_REF).toMatch(/^[a-z]{20}$/);
    expect(STAGING_PROJECT_REF).toMatch(/^[a-z]{20}$/);
  });

  it("matches the audit that recorded which project is production", () => {
    // The ref is verified against the document it came from, not against this
    // test's own copy of it. DEFINING-STATEMENTS.md §8.
    const audit = readFileSync("docs/audits/2026-08-18-prelaunch.md", "utf8");
    expect(
      audit.includes(`\`${PRODUCTION_PROJECT_REF}\``),
      `docs/audits/2026-08-18-prelaunch.md no longer names ${PRODUCTION_PROJECT_REF} as the production project; if production moved, move it here too`,
    ).toBe(true);
  });
});

describe("Claude Code denies the production data plane", () => {
  it("has a deny list at all", () => {
    expect(denyRules().length).toBeGreaterThan(0);
  });

  it("denies WebFetch to every production host", () => {
    const rules = denyRules();
    for (const host of PRODUCTION_DENY_HOSTS) {
      expect(
        rules,
        `${SETTINGS} must deny WebFetch(domain:${host}). This is the enforced half of the control — the Bash entries are not.`,
      ).toContain(`WebFetch(domain:${host})`);
    }
  });

  it("denies the obvious command-line routes to production", () => {
    const rules = denyRules().join("\n");
    for (const tool of ["curl", "psql", "supabase link"]) {
      expect(
        rules,
        `${SETTINGS} has no Bash deny covering \`${tool}\` against ${PRODUCTION_PROJECT_REF}`,
      ).toContain(tool);
    }
  });

  it("never denies staging, which would break every legitimate task", () => {
    for (const rule of denyRules()) {
      expect(
        rule.includes(STAGING_PROJECT_REF),
        `${SETTINGS} denies ${rule}, which names the STAGING project. Staging is where the work happens; denying it leaves production reachable and looks like a working control.`,
      ).toBe(false);
    }
  });

  it("leaves a bare command containing the ref reviewable", () => {
    // A `*<ref>*` pattern would block `grep <ref> docs/`, which is how this
    // control is audited. Each Bash rule must name a program, not just the ref.
    const bash = denyRules().filter((rule) => rule.startsWith("Bash("));
    const refOnly = bash.filter((rule) =>
      new RegExp(`^Bash\\(\\*?${PRODUCTION_PROJECT_REF}`).test(rule),
    );
    expect(
      refOnly,
      `these rules match any command mentioning the ref, including the grep that audits them: ${refOnly.join(", ")}`,
    ).toEqual([]);
  });
});

describe("the Codex snippet cannot drift from the same source", () => {
  it("denies exactly the hosts Claude Code denies", () => {
    // Codex's config lives on the operator's machine and no test can read it
    // there. What a test can do is keep the paste-ready text correct, so the two
    // agents are never given different boundaries.
    const toml = readFileSync(CODEX_SNIPPET, "utf8");
    for (const host of PRODUCTION_DENY_HOSTS) {
      expect(toml, `${CODEX_SNIPPET} does not deny ${host}`).toContain(host);
    }
    expect(
      toml.includes(STAGING_PROJECT_REF),
      `${CODEX_SNIPPET} names the staging project in a deny rule`,
    ).toBe(false);
  });
});
