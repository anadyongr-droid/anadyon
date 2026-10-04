#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Merges this project's managed-settings template into whatever managed policy
 * a machine already has, and prints the result.
 *
 * **Why a merge rather than a write.** `scripts/install-managed-gate.sh` used to
 * copy the existing `managed-settings.json` aside and then overwrite it from the
 * template. Codex reported it in the 4 October review: that silently removes any
 * other managed control on the machine — an enterprise policy, a second hook, a
 * permission rule somebody set deliberately. A backup file is not a mitigation,
 * because nobody reads a backup they do not know was taken, and the controls
 * that vanish are exactly the ones nobody is watching.
 *
 * **The rules, and which side wins.**
 *
 * - **Objects** are merged key by key, recursively, so an unrelated top-level
 *   setting survives untouched.
 * - **Arrays** are unioned, compared by value, so our `PreToolUse` entry is
 *   appended beside an existing hook rather than replacing it — and running the
 *   installer twice does not produce two copies of the same hook.
 * - **Scalars** are taken from the template, because the template is the
 *   reviewed control and a conflicting value is a policy this project means to
 *   set. Every one of those is printed on stderr, so an operator sees what
 *   changed rather than discovering it later.
 *
 * The gate fires twice where a project hook is also configured, which is
 * harmless — both copies agree — and is documented at the end of the installer.
 *
 * usage: merge-managed-settings.mjs <existing.json|-> <template.json> [gateRoot]
 *
 * `-` for the existing file means "there is none"; `gateRoot` replaces
 * `GATE_ROOT_PLACEHOLDER` in the template, which is how the hook comes to point
 * at the root-owned copy rather than at the repository's.
 */

/** @param {unknown} value */
const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} existing
 * @param {unknown} template
 * @param {string[]} path
 * @param {string[]} overwritten collects `a.b.c: old -> new` for every scalar the template takes over
 * @returns {unknown}
 */
export function mergeManagedSettings(existing, template, path = [], overwritten = []) {
  if (existing === undefined) return template;
  if (template === undefined) return existing;

  if (isPlainObject(existing) && isPlainObject(template)) {
    /** @type {Record<string, unknown>} */
    const merged = { ...(/** @type {Record<string, unknown>} */ (existing)) };
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (template))) {
      merged[key] = mergeManagedSettings(merged[key], value, [...path, key], overwritten);
    }
    return merged;
  }

  if (Array.isArray(existing) && Array.isArray(template)) {
    const union = [...existing];
    for (const item of template) {
      if (!union.some((held) => JSON.stringify(held) === JSON.stringify(item))) union.push(item);
    }
    return union;
  }

  if (JSON.stringify(existing) !== JSON.stringify(template)) {
    overwritten.push(`${path.join(".") || "(root)"}: ${JSON.stringify(existing)} -> ${JSON.stringify(template)}`);
  }
  return template;
}

/** @param {string[]} argv */
export function main(argv) {
  const [existingPath, templatePath, gateRoot] = argv;
  if (!templatePath) {
    process.stderr.write("usage: merge-managed-settings.mjs <existing.json|-> <template.json> [gateRoot]\n");
    return 1;
  }

  let templateText = readFileSync(templatePath, "utf8");
  if (gateRoot) templateText = templateText.split("GATE_ROOT_PLACEHOLDER").join(gateRoot);
  if (templateText.includes("GATE_ROOT_PLACEHOLDER")) {
    process.stderr.write("the template still contains GATE_ROOT_PLACEHOLDER and no gate root was given\n");
    return 1;
  }
  const template = JSON.parse(templateText);

  let existing = {};
  if (existingPath && existingPath !== "-") {
    const text = readFileSync(existingPath, "utf8").trim();
    if (text !== "") {
      // A managed policy that is not valid JSON is a refusal, never something to
      // step over: the file is read at startup by every session on the machine,
      // and replacing one somebody is mid-edit on would lose their work.
      existing = JSON.parse(text);
    }
  }

  /** @type {string[]} */
  const overwritten = [];
  const merged = mergeManagedSettings(existing, template, [], overwritten);
  for (const line of overwritten) process.stderr.write(`    the template takes over ${line}\n`);
  process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("merge-managed-settings.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
