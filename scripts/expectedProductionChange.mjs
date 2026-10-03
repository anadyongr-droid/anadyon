import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A declared, committed record that a specific production change is expected.
 *
 * **Why this exists.** The nightly production check needs to tell a legitimate
 * change from an unexplained one. The obvious rule — "every production change
 * must be explainable by a merge commit" — is wrong for this project, because
 * `AGENTS.md` forbids an agent applying a Supabase migration: a human pastes it
 * into the SQL editor. So legitimate schema changes routinely have no automated
 * trail, and that rule would fire on every one of them. **An alarm that cries
 * wolf monthly gets muted, and a muted alarm is worse than none because it still
 * looks present.**
 *
 * Proposed by Codex in the 3 October adversarial review, which is also where the
 * field list comes from. It replaces the merge-commit invariant.
 *
 * **The declaration is made before the paste, not after.** That ordering is the
 * whole value: a marker committed afterwards would explain anything, including a
 * change nobody intended.
 *
 * **The hash is what makes it mean something.** Without it the marker says "some
 * change to this file is expected", which an edited migration satisfies just as
 * well as the reviewed one. `migrationPasteParity.test.ts` already holds the
 * migration and its SQL-editor copy to each other after normalisation; this holds
 * both to the exact bytes that were declared, because the paste copy is what is
 * actually run and migration 033 is the precedent for it drifting.
 *
 * **Expiry makes an unapplied marker escalate itself.** A declaration that sits
 * past its own date is either a migration that was forgotten or one that was
 * applied without the record being closed, and both are worth a failure.
 * `DEFINING-STATEMENTS.md` §12 requires dated items to be checked against the
 * calendar rather than carried forward; this is that rule in a test.
 */
const DIR = "supabase/expected-changes";
const MIGRATIONS = "supabase/migrations";

/** The fields Codex specified, plus the two dates the expiry rule needs. */
export const REQUIRED_FIELDS = [
  "migration",
  "sha256",
  "expected_objects",
  "operator",
  "declared",
  "expires",
];

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const isIsoDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Validates one marker and returns a list of problems, empty when it is sound.
 *
 * `now` and `readFile` are injected so the test can exercise expiry and hash
 * mismatches without writing files or waiting for a date to pass — a test that
 * can only check the markers that happen to exist today would pass vacuously on
 * an empty directory, which is how this class of control gets believed.
 */
/**
 * @param {unknown} marker
 * @param {{ now?: Date, readFile?: (path: string) => string | null, name?: string }} [options]
 * @returns {string[]}
 */
export function validateExpectedChange(marker, { now = new Date(), readFile, name = "marker" } = {}) {
  const problems = [];
  const at = (text) => `${name}: ${text}`;

  if (typeof marker !== "object" || marker === null) return [at("is not an object")];
  /** @type {Record<string, unknown>} */
  const m = /** @type {Record<string, unknown>} */ (marker);

  for (const field of REQUIRED_FIELDS) {
    if (m[field] === undefined || m[field] === null || m[field] === "") {
      problems.push(at(`is missing \`${field}\``));
    }
  }
  if (problems.length > 0) return problems;

  if (!Array.isArray(m.expected_objects) || m.expected_objects.length === 0) {
    problems.push(at("`expected_objects` must list at least one object, or the marker claims nothing checkable"));
  }
  if (!isIsoDate(m.declared)) problems.push(at("`declared` must be YYYY-MM-DD"));
  if (!isIsoDate(m.expires)) problems.push(at("`expires` must be YYYY-MM-DD"));
  if (isIsoDate(m.declared) && isIsoDate(m.expires) && m.expires <= m.declared) {
    problems.push(at("`expires` must be after `declared`"));
  }
  if (!/^[0-9a-f]{64}$/.test(m.sha256)) {
    problems.push(at("`sha256` must be a 64-character hex digest of the migration file"));
  }

  // An applied marker is history and stops being checked against the calendar.
  const applied = typeof m.applied === "string" && m.applied.length > 0;
  if (!applied && isIsoDate(m.expires)) {
    const today = now.toISOString().slice(0, 10);
    if (m.expires < today) {
      problems.push(
        at(
          `expired on ${m.expires} and is not marked applied — either the migration was forgotten, or it was applied and the record was never closed. §12 escalates a dated item rather than carrying it forward`,
        ),
      );
    }
  }

  if (readFile) {
    const path = join(MIGRATIONS, m.migration);
    const contents = readFile(path);
    if (contents === null) {
      problems.push(at(`names \`${m.migration}\`, which does not exist in ${MIGRATIONS}`));
    } else {
      const actual = sha256(contents);
      if (actual !== m.sha256) {
        problems.push(
          at(
            `declares sha256 ${m.sha256.slice(0, 12)}… but \`${m.migration}\` hashes to ${actual.slice(0, 12)}…. The file changed after the declaration, so what would be pasted is not what was declared`,
          ),
        );
      }
      for (const object of m.expected_objects ?? []) {
        if (typeof object === "string" && !contents.includes(object)) {
          problems.push(at(`lists expected object \`${object}\`, which does not appear in the migration`));
        }
      }
    }
  }

  return problems;
}

/** Reads every committed marker. Returns `[]` when the directory is absent. */
export function readExpectedChanges(dir = DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, marker: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}
