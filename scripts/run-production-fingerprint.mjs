#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { liveExpectedChanges } from "./expectedProductionChange.mjs";
import { replayedFingerprint } from "./replayedFingerprint.mjs";
import {
  compareCounts,
  diffFingerprints,
  digest,
  explainWith,
  renderReport,
  worstSeverity,
} from "./productionFingerprint.mjs";

/**
 * The nightly production check, as the workflow runs it.
 *
 * **Inputs are files, not a database connection.** The production side is read
 * by `psql` in `.github/workflows/production-fingerprint.yml` and handed here as
 * JSON, for one reason that matters: **no credential ever reaches this script,
 * so no credential reaches an agent.** The connection string lives in GitHub
 * Actions secrets, which neither agent can read — the same arrangement the
 * nightly backup has used for eleven consecutive runs. An agent writes the
 * comparison and never holds the key.
 *
 * **A check that could not run must never look green.** `E21` is in the open
 * items list because the production schema-drift step in CI *exits successfully
 * without comparing anything* when its secrets are absent, which is worse than
 * having no step: the gate looks stronger than it is. So a missing input here is
 * an explicit `NOT RUN` and a **non-zero exit**, never silence.
 *
 * Exit codes: `0` quiet or normal, `1` could not run, `2` unexplained
 * differences at `high`, `3` a `critical` exposure.
 */
const usage = `
usage: run-production-fingerprint.mjs --actual <fingerprint.json> [options]

  --actual <path>        production's fingerprint, from scripts/sql/production-fingerprint.sql
  --counts <path>        tonight's row counts, from scripts/sql/production-counts.sql
  --previous <path>      last night's row counts (absent on the first run)
  --report <path>        where to write the Markdown report (default: stdout only)
  --counts-out <path>    where to write tonight's counts for tomorrow's comparison
`;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

function readJson(path, what) {
  if (!path) return null;
  if (!existsSync(path)) throw new Error(`${what} was expected at ${path} and is not there`);
  const text = readFileSync(path, "utf8").trim();
  if (text === "") throw new Error(`${what} at ${path} is empty — psql produced nothing, which is a failed query and not an empty database`);
  return JSON.parse(text);
}

async function main() {
  const actualPath = arg("actual");
  if (!actualPath) {
    process.stdout.write(usage);
    process.exitCode = 1;
    return;
  }

  let actual;
  let counts = null;
  try {
    actual = readJson(actualPath, "production's fingerprint");
    counts = readJson(arg("counts"), "tonight's row counts");
  } catch (error) {
    // The NOT RUN path. Loud, and non-zero.
    const message = [
      "# Production fingerprint — NOT RUN",
      "",
      `**This check did not run and is reporting nothing.** ${error.message}`,
      "",
      "Treated as a failure rather than a pass, deliberately: a monitoring step that",
      "exits 0 without comparing anything is worse than no step, because it looks like",
      "cover. Open item E21 is the same defect in the CI drift check.",
      "",
    ].join("\n");
    process.stdout.write(`${message}\n`);
    const reportPath = arg("report");
    if (reportPath) writeFileSync(reportPath, message);
    process.exitCode = 1;
    return;
  }

  const { fingerprint: expected, migrations } = await replayedFingerprint();

  // **Only a marker that is valid, unexpired and unapplied explains anything.**
  // Until 4 October 2026 this read the directory and used every file in it
  // without validating one — so an applied marker went on absorbing changes to
  // the objects it named, and the expiry rule bit only in CI. Codex found it
  // twice; `liveExpectedChanges` is where the reasoning is written down.
  const { live: markers, rejected } = liveExpectedChanges();

  // A rejected marker is a finding, not a silent omission: a `high` row for one
  // that is invalid or expired, so the night it goes stale is the night somebody
  // is told, and a plain note for one that is simply retired.
  const markerRows = rejected
    .filter((entry) => entry.severity === "high")
    .map((entry) => ({
      kind: "marker.rejected",
      object: entry.name,
      severity: "high",
      detail: entry.reason,
    }));

  const structural = [...explainWith(diffFingerprints(expected, actual), markers), ...markerRows];
  const rowChanges = counts ? compareCounts(readJson(arg("previous"), "last night's row counts") ?? null, counts) : [];

  const report = renderReport({
    changes: structural,
    counts: rowChanges,
    expectedDigest: `${digest(expected)} (${migrations} migrations)`,
    actualDigest: digest(actual),
    markers,
    retired: rejected.map((entry) => `${entry.name} (${entry.reason})`),
  });

  process.stdout.write(`${report}\n`);
  const reportPath = arg("report");
  if (reportPath) writeFileSync(reportPath, report);

  const countsOut = arg("counts-out");
  if (countsOut && counts) writeFileSync(countsOut, JSON.stringify(counts, null, 2));

  const worst = worstSeverity([...structural, ...rowChanges]);
  process.exitCode = worst === "critical" ? 3 : worst === "high" ? 2 : 0;
}

await main();
