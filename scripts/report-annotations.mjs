#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Makes the nightly fingerprint's findings readable without downloading an
 * artifact.
 *
 * **Why this exists, and it is the same failure this project keeps finding.**
 * The report is written to the step summary and uploaded as an artifact. Both
 * are served from hosts an agent container cannot reach — GitHub serves logs and
 * artifacts from a storage domain, so `gh api …/logs` and the artifact zip both
 * refuse. On 4 October 2026 the check ran, found differences at `high`, sent the
 * alert, and **the rows were unreadable from here**: the only thing an agent
 * could learn through the API was that the job had failed.
 *
 * A control whose output cannot be read is a control that gets summarised from
 * memory, and this project has already corrected two documents that were written
 * that way. **Check-run annotations are served by the API**, so the findings go
 * there as well: `GET /repos/{owner}/{repo}/check-runs/{id}/annotations` returns
 * them to anyone who can read the repository, with no credential and no
 * download.
 *
 * **Grouped, one annotation per severity, because of a limit.** GitHub shows at
 * most ten annotations of each level per step, and a night with fourteen `high`
 * rows would silently lose four — the specific kind of partial truth this whole
 * check exists to avoid. One annotation carries its whole group, newline-escaped,
 * and says how many rows it had to drop if the message would be too long.
 *
 * `explained` rows are deliberately not annotated: a declared change is not a
 * finding, and putting it beside the findings is how the two stop being
 * distinguishable.
 *
 * usage: report-annotations.mjs <report.md> [--counts-line]
 */

export const SEVERITY_ORDER = ["critical", "high", "normal", "explained"];

/**
 * Reads the severity groups out of the rendered report.
 *
 * Parsing our own Markdown is not elegant, and the alternative — having
 * `renderReport` return a structure as well as a string — would mean two
 * callers and a second thing to keep in step. The report's shape is asserted by
 * `tests/productionFingerprint.test.ts`, so a change to it breaks there first.
 *
 * @param {string} markdown
 * @returns {Map<string, string[]>}
 */
export function parseReport(markdown) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  let current = null;
  for (const line of String(markdown).split("\n")) {
    const header = /^## (critical|high|normal|explained) \((\d+)\)\s*$/.exec(line);
    if (header) {
      current = header[1];
      groups.set(current, []);
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      continue;
    }
    if (current && line.startsWith("- ")) groups.get(current)?.push(line.slice(2).trim());
  }
  return groups;
}

/**
 * One line for the alert: `high 14 · normal 10 · explained 2`.
 *
 * It is what tells a reader on a phone whether tonight is last night with the
 * same unresolved findings or something new, which the headline alone cannot say.
 *
 * @param {Map<string, string[]>} groups
 */
export function countsLine(groups) {
  const parts = SEVERITY_ORDER.filter((severity) => (groups.get(severity) ?? []).length > 0).map(
    (severity) => `${severity} ${groups.get(severity)?.length}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "no differences";
}

/** Workflow commands take `%`, carriage returns and newlines escaped. */
const escapeData = (text) =>
  String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/**
 * **Why each row is capped as well as the group.** The first run that used these
 * annotations, 4 October 2026, truncated its `normal` group after **one** row:
 * a `function.definition` difference carries both function bodies, which came to
 * some three thousand characters on its own and starved the other fourteen rows.
 * The group said "and 12 more row(s)" honestly enough, and the twelve were the
 * ones worth reading.
 *
 * So a row is cut to `rowLimit` here, and the full text stays in the report and
 * its artifact. **The annotation is an index of findings, not the findings** —
 * `quotes.pickup_date — column — expected "date not null", found "text"` is the
 * whole finding in one line, and a 1,500-character function body is not.
 *
 * @param {Map<string, string[]>} groups
 * @param {{ limit?: number, rowLimit?: number }} [options] characters per message, and per row
 * @returns {string[]} workflow commands, one per severity group
 */
export function annotations(groups, { limit = 6000, rowLimit = 300 } = {}) {
  /** @type {string[]} */
  const commands = [];
  for (const severity of SEVERITY_ORDER) {
    if (severity === "explained") continue;
    const rows = groups.get(severity) ?? [];
    if (rows.length === 0) continue;

    const level = severity === "normal" ? "notice" : "error";
    const kept = [];
    let used = 0;
    for (const row of rows) {
      const line = row.length > rowLimit ? `${row.slice(0, rowLimit)}…` : row;
      if (used + line.length + 3 > limit) break;
      kept.push(`- ${line}`);
      used += line.length + 3;
    }
    const omitted = rows.length - kept.length;
    const message = [
      `${severity} (${rows.length})`,
      ...kept,
      omitted > 0 ? `… and ${omitted} more row(s) — the full report is the run artifact` : null,
    ]
      .filter((line) => line !== null)
      .join("\n");

    commands.push(`::${level} title=production fingerprint: ${severity}::${escapeData(message)}`);
  }
  return commands;
}

/** @param {string[]} argv */
export function main(argv) {
  const path = argv.find((argument) => !argument.startsWith("--"));
  if (!path) {
    process.stderr.write("usage: report-annotations.mjs <report.md> [--counts-line]\n");
    return 1;
  }
  const groups = parseReport(readFileSync(path, "utf8"));
  if (argv.includes("--counts-line")) {
    process.stdout.write(`${countsLine(groups)}\n`);
    return 0;
  }
  for (const command of annotations(groups)) process.stdout.write(`${command}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("report-annotations.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
