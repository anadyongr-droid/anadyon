import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeManagedSettings } from "../scripts/merge-managed-settings.mjs";
import {
  PRODUCTION_DENY_HOSTS,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../scripts/deployment-boundary-lib.mjs";

/**
 * The managed policy a person installs with `sudo` must say at least what the
 * project policy says, and must point at the root-owned gate.
 *
 * **Why this test and not a hash.** Fable's round-two review put W34 second in
 * the order of work: the gate lives at a path inside the workspace Codex may
 * write, and the rule protecting it is enforced by the gate itself. The fix is
 * a root-owned copy registered from managed settings — but the obvious way to
 * keep the two in step, a digest pinned beside the file it pins, **moves with
 * the file**, which is open item E30 observed rather than theorised.
 *
 * So the direction is fixed: the **repository is the source**, the root-owned
 * files are the **control**, and this test is what holds them together on a
 * machine neither agent holds a credential for. If the production ref ever
 * changes, or someone trims the managed deny list below the project's, CI fails
 * here rather than a Mac quietly enforcing less than the repository believes.
 *
 * It cannot check the installed file. Only the template, which is what the
 * installer renders — the install itself is verified by the script's own two
 * live firings and by `/hooks` in a new session.
 */
const TEMPLATE = "docs/agent-controls/managed-settings-template.json";
const PROJECT = ".claude/settings.json";
const INSTALLER = "scripts/install-managed-gate.sh";

type Settings = {
  permissions?: { deny?: string[] };
  hooks?: { PreToolUse?: { matcher?: string; hooks?: { type: string; command: string; timeout?: number }[] }[] };
};

const template = JSON.parse(readFileSync(TEMPLATE, "utf8")) as Settings;
const project = JSON.parse(readFileSync(PROJECT, "utf8")) as Settings;

/** The production rules, which are the ones that must not be lost. */
const productionRules = (settings: Settings) =>
  (settings.permissions?.deny ?? []).filter((rule) => rule.includes(PRODUCTION_PROJECT_REF));

describe("the managed policy is at least as strict as the project policy", () => {
  it("carries every production deny rule the project carries", () => {
    const managed = productionRules(template);
    const inProject = productionRules(project);
    expect(inProject.length, `${PROJECT} has no production deny rules, so this test would pass vacuously`).toBeGreaterThan(3);
    for (const rule of inProject) {
      expect(managed, `${TEMPLATE} is missing \`${rule}\`, so the machine would enforce less than the repository does`).toContain(rule);
    }
  });

  it("denies every production host", () => {
    const deny = (template.permissions?.deny ?? []).join("\n");
    for (const host of PRODUCTION_DENY_HOSTS) {
      expect(deny, `${TEMPLATE} does not deny ${host}`).toContain(host);
    }
  });

  it("never names staging, which would break every legitimate task", () => {
    // The same assertion the other control tests carry, and for the same
    // reason: a transposed ref would look like a working policy and be the
    // exact opposite, and this one needs `sudo` to undo.
    expect(JSON.stringify(template)).not.toContain(STAGING_PROJECT_REF);
  });
});

describe("the managed policy runs the root-owned gate", () => {
  const groups = template.hooks?.PreToolUse ?? [];

  it("registers a PreToolUse command hook", () => {
    expect(groups.length).toBeGreaterThan(0);
    const handlers = groups.flatMap((group) => group.hooks ?? []);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) expect(handler.type).toBe("command");
  });

  it("points outside the repository, at the path the installer writes", () => {
    // The whole value of W34 is that the gate is NOT the copy an agent can
    // edit. A managed policy pointing back into the workspace would reinstate
    // the circularity it exists to break.
    const commands = groups.flatMap((group) => (group.hooks ?? []).map((handler) => handler.command));
    for (const command of commands) {
      expect(command).toContain("GATE_ROOT_PLACEHOLDER");
      expect(command.endsWith(".claude/hooks/production-gate.mjs"), command).toBe(true);
      expect(command, "a managed hook must not run the workspace copy").not.toContain("CLAUDE_PROJECT_DIR");
    }
  });

  it("uses the placeholder whatever substitutes it", () => {
    // Three files, one string. If any side is renamed the install silently
    // produces a hook path that does not exist, and a hook that cannot start is
    // indistinguishable from a hook that allowed the call — which is precisely
    // how W32 was misread.
    //
    // The substitution moved on 4 October: the installer used to `sed` the
    // template itself and now hands it to `scripts/merge-managed-settings.mjs`,
    // so that the machine's existing managed policy is merged rather than
    // replaced. The string has to line up across all three.
    const installer = readFileSync(INSTALLER, "utf8");
    const merger = readFileSync("scripts/merge-managed-settings.mjs", "utf8");
    expect(merger, "whatever renders the template must know the placeholder").toContain(
      "GATE_ROOT_PLACEHOLDER",
    );
    expect(installer, "the installer must render the template it is paired with").toContain(TEMPLATE.split("/").pop());
    expect(installer, "the installer must call the renderer").toContain("merge-managed-settings.mjs");
    expect(installer, "the installer must pass the gate root to it").toMatch(/merge-managed-settings\.mjs[\s\S]{0,200}\$GATE_ROOT/);
  });
});

describe("installing the gate does not remove somebody else's managed policy", () => {
  /**
   * Reported by Codex on 4 October 2026: the installer copied the machine's
   * existing `managed-settings.json` aside and then wrote the template over it.
   * **A backup is not a mitigation** — nobody reads a backup they do not know
   * was taken, and the controls that would vanish are precisely the ones nobody
   * is watching.
   */
  /** Only the parts these cases read; the file may hold anything else. */
  type HookHandler = { type?: string; command?: string };
  type HookGroup = { matcher?: string; hooks?: HookHandler[] };
  type ManagedSettings = {
    env?: Record<string, string>;
    permissions?: { deny?: string[] };
    hooks?: { PreToolUse?: HookGroup[] | unknown };
  };

  const render = (existing: unknown, overwritten: string[] = []) =>
    mergeManagedSettings(
      existing,
      JSON.parse(readFileSync(TEMPLATE, "utf8").split("GATE_ROOT_PLACEHOLDER").join("/usr/local/lib/anadyon-gate")),
      [],
      overwritten,
    ) as ManagedSettings;

  it("keeps an unrelated managed setting untouched", () => {
    const merged = render({ env: { SOMETHING_ELSE: "1" }, permissions: { deny: ["Read(./.env*)"] } });
    expect(merged.env).toEqual({ SOMETHING_ELSE: "1" });
    expect(merged.permissions?.deny).toContain("Read(./.env*)");
  });

  it("appends the gate beside a hook that is already there", () => {
    const theirs = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/opt/their-own-hook.sh" }] }],
      },
    };
    const merged = render(theirs);
    const groups = (merged.hooks?.PreToolUse ?? []) as HookGroup[];
    const commands = groups.flatMap((group) => (group.hooks ?? []).map((handler) => handler.command ?? ""));
    expect(commands, "their hook was dropped").toContain("/opt/their-own-hook.sh");
    expect(commands.some((command: string) => command.includes("production-gate.mjs"))).toBe(true);
  });

  it("is idempotent, so running the installer twice does not double the gate", () => {
    const once = render({});
    const twice = render(once);
    expect(twice).toEqual(once);
  });

  it("reports every scalar the template takes over, rather than changing it quietly", () => {
    const overwritten: string[] = [];
    render({ ...render({}), apiKeyHelper: "/opt/mine.sh" }, overwritten);
    expect(overwritten).toEqual([]);

    const clashes: string[] = [];
    const merged = render({ hooks: { PreToolUse: "not-an-array" } }, clashes);
    expect(clashes.join(" "), "a replaced value was not reported").toContain("hooks.PreToolUse");
    expect(Array.isArray(merged.hooks?.PreToolUse)).toBe(true);
  });
});
