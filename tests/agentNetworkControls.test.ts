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

/**
 * A deliberately narrow TOML reader, strict by refusal.
 *
 * **Why this exists.** The test below used to `grep` the snippet for the
 * production hostname and pass. On 3 October 2026 Codex ran the same file
 * through Codex's own strict loader, which rejected it outright —
 * `data did not match any variant of untagged enum FeatureToml` — because the
 * file used `deny = [...]` where the schema has a `domains` map. **The file was
 * inert and the test was green**, for the reason a grep is always a weak
 * instrument here: the hostname it searched for was also present in the prose
 * above the key, so the assertion was satisfied by a comment.
 *
 * This parses instead, and **throws on any construct it does not understand**
 * rather than skipping the line — a parser that ignores what it cannot read
 * would reproduce the original fault in a more convincing disguise.
 *
 * **What it is not.** It is not a TOML implementation and not a substitute for
 * Codex's loader, which is the authoritative check and runs on the operator's
 * machine. It holds the shape of *this* file to the documented schema, which is
 * the part that can be checked in CI.
 */
function parseToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let table = root;

  const value = (raw: string, line: number): unknown => {
    const v = raw.trim();
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^"[^"]*"$/.test(v)) return v.slice(1, -1);
    if (/^-?\d+$/.test(v)) return Number(v);
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      return inner === "" ? [] : inner.split(",").map((item) => value(item, line));
    }
    if (v.startsWith("{") && v.endsWith("}")) {
      const map: Record<string, unknown> = {};
      const inner = v.slice(1, -1).trim();
      if (inner === "") return map;
      for (const pair of inner.split(",")) {
        const eq = pair.indexOf("=");
        if (eq === -1) throw new Error(`line ${line}: \`${pair.trim()}\` is not a key = value pair`);
        const key = pair.slice(0, eq).trim().replace(/^"|"$/g, "");
        map[key] = value(pair.slice(eq + 1), line);
      }
      return map;
    }
    throw new Error(`line ${line}: cannot read the value \`${v}\``);
  };

  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (line === "" || line.startsWith("#")) return;

    const header = /^\[([A-Za-z0-9_.]+)\]$/.exec(line);
    if (header) {
      table = header[1].split(".").reduce<Record<string, unknown>>((node, part) => {
        node[part] ??= {};
        return node[part] as Record<string, unknown>;
      }, root);
      return;
    }

    const eq = line.indexOf("=");
    if (eq === -1) throw new Error(`line ${index + 1}: \`${line}\` is neither a table header nor an assignment`);
    table[line.slice(0, eq).trim()] = value(line.slice(eq + 1), index + 1);
  });

  return root;
}

describe("the Codex snippet cannot drift from the same source", () => {
  const toml = readFileSync(CODEX_SNIPPET, "utf8");

  it("denies exactly the hosts Claude Code denies, and never staging", () => {
    for (const host of PRODUCTION_DENY_HOSTS) {
      expect(toml, `${CODEX_SNIPPET} does not deny ${host}`).toContain(host);
    }
    expect(
      toml.includes(STAGING_PROJECT_REF),
      `${CODEX_SNIPPET} names the staging project in a deny rule`,
    ).toBe(false);
  });

  it("parses, and every line of it is a construct this reader recognises", () => {
    expect(() => parseToml(toml)).not.toThrow();
  });

  it("matches the documented features.network_proxy schema", () => {
    const parsed = parseToml(toml) as {
      features?: { network_proxy?: Record<string, unknown> };
    };
    const proxy = parsed.features?.network_proxy;
    expect(proxy, `${CODEX_SNIPPET} has no [features.network_proxy] table`).toBeTypeOf("object");
    expect(proxy!.enabled, "the proxy must be enabled or the domains are never consulted").toBe(true);

    // The schema is `domains: map<string, allow | deny>`. The array form this
    // file carried until 3 October is what Codex's loader rejected.
    expect(
      Array.isArray(proxy!.deny),
      "`deny = [...]` is not in the schema; the loader rejects the whole file. Use the `domains` map.",
    ).toBe(false);
    const domains = proxy!.domains as Record<string, string> | undefined;
    expect(domains, "no `domains` map, so nothing is denied").toBeTypeOf("object");

    for (const [pattern, decision] of Object.entries(domains!)) {
      expect(
        ["allow", "deny"],
        `domains."${pattern}" is "${decision}"; the schema allows only "allow" or "deny"`,
      ).toContain(decision);
    }
    for (const host of PRODUCTION_DENY_HOSTS) {
      expect(domains![host], `domains has no deny for ${host}`).toBe("deny");
    }
  });
});

describe("the Codex hooks template is loadable by Codex", () => {
  const TEMPLATE = "docs/agent-controls/codex-hooks-template.json";
  const template = JSON.parse(readFileSync(TEMPLATE, "utf8")) as Record<string, unknown>;

  /**
   * Every assertion here exists because the first version of this file loaded
   * **zero** hooks and nobody noticed for a day.
   *
   * Codex's loader rejected it with `unknown field PreToolUse, expected
   * description or hooks`. Two conclusions, and the second cost more than the
   * first: the event names belong inside a `hooks` object — and the project's
   * open item W32, *"the desktop app does not invoke hooks.json"*, was concluded
   * from an instrument that was never switched on. A file nothing loads cannot
   * fire on any surface, so the test that produced W32 could only ever have
   * produced W32.
   */
  it("has only the top-level fields the loader accepts", () => {
    // The rejection above is a strict-schema error: anything outside this set
    // fails the whole file. A `_comment` key would too — which is why the
    // commentary moved to codex-hooks-template.md.
    expect(Object.keys(template).sort()).toEqual(["description", "hooks"]);
  });

  it("puts PreToolUse inside the hooks object", () => {
    const hooks = template.hooks as Record<string, unknown>;
    expect(hooks).toBeTypeOf("object");
    expect(Object.keys(hooks)).toContain("PreToolUse");
    expect((template as { PreToolUse?: unknown }).PreToolUse).toBeUndefined();
  });

  it("points at the same gate Claude Code runs, by absolute path", () => {
    const groups = (template.hooks as { PreToolUse: { matcher?: string; hooks: { type: string; command: string }[] }[] }).PreToolUse;
    expect(groups.length).toBeGreaterThan(0);
    const handlers = groups.flatMap((group) => group.hooks);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(handler.type).toBe("command");
      expect(
        handler.command.endsWith(".claude/hooks/production-gate.mjs"),
        `the template runs \`${handler.command}\`, which is not the shared gate`,
      ).toBe(true);
      expect(
        handler.command.startsWith("ABSOLUTE_PATH_TO_REPO/") || handler.command.startsWith("/"),
        "Codex's working directory is not the repository root, so the path must be absolute",
      ).toBe(true);
    }

    // Codex's matchers are regular expressions — the documented example is
    // `"startup|resume"` — and `*` is not one. Claude Code's `"*"` is correct in
    // its own settings file and wrong here.
    for (const group of groups) {
      if (group.matcher === undefined) continue;
      expect(group.matcher).not.toBe("*");
      expect(() => new RegExp(group.matcher!)).not.toThrow();
    }
  });
});
