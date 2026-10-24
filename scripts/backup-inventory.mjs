#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Reads an `aws s3 ls` listing of the backup bucket and says whether the
 * archives are actually there — every night, none missing, the newest fresh.
 *
 * **Why this exists.** On 20 October 2026 Tasos asked whether backups had been
 * taken over the previous four weeks, and the only answers available were a
 * run history of green ticks and one inference: the prune step had deleted
 * `daily/anadyon-2026-09-20T…`, which means thirty-one objects existed. Both
 * are circumstantial. The run history is *specifically* the thing that lied
 * here before — four failed backups reported their alert step as successful
 * while nothing was sent — and a count of thirty-one says nothing about which
 * thirty-one, so a week of doubled uploads and a week of none would look
 * identical.
 *
 * A backup you have not listed is a backup you are assuming. This lists them.
 *
 * **What counts as a failure, and why each one.**
 *   * A **missing day** inside the covered window. The job runs nightly, so a
 *     date with no archive is a night that produced nothing, whatever the run
 *     log said.
 *   * A **stale newest**. Beyond 48 hours the schedule has stopped and nobody
 *     noticed; one night's grace covers a late run crossing midnight UTC.
 *   * An **implausibly small** archive. The dump guard already refuses a file
 *     under 100 bytes, but it runs *before* compression and cannot see an
 *     archive that shrank by an order of magnitude because a table stopped
 *     being dumped. Measured against this bucket's own median, not a constant.
 *
 * It takes the listing on a file path or stdin so it is testable without
 * credentials, and so the credential never reaches this process.
 */

/** One daily archive: `anadyon-2026-10-20T01-58-16Z.tar.gz.enc`. */
const KEY = /anadyon-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.tar\.gz\.enc$/;

/** `2026-10-20 01:58:21     164752 anadyon-2026-10-20T01-58-16Z.tar.gz.enc` */
export function parseListing(text) {
  const entries = [];
  for (const line of String(text).split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const key = parts[parts.length - 1];
    const match = KEY.exec(key);
    if (!match) continue;
    const size = Number(parts[parts.length - 2]);
    if (!Number.isFinite(size)) continue;
    entries.push({ key, day: match[1], size });
  }
  return entries.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Every calendar day from `from` to `to` inclusive, as `YYYY-MM-DD`. */
export function daysBetween(from, to) {
  const days = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * @param {string} listing  raw `aws s3 ls` output
 * @param {{ now?: Date, staleHours?: number, shrinkRatio?: number }} [options]
 */
export function inventory(listing, { now = new Date(), staleHours = 48, shrinkRatio = 0.2 } = {}) {
  const entries = parseListing(listing);
  const problems = [];
  const notes = [];

  if (entries.length === 0) {
    return {
      ok: false,
      entries,
      problems: ["the listing holds no backup archive at all — either the bucket is empty or the prefix is wrong"],
      notes,
    };
  }

  const days = new Set(entries.map((e) => e.day));
  const oldest = entries[0].day;
  const newest = entries[entries.length - 1].day;

  // Missing days, inside the window the bucket itself covers. Retention trims
  // the old end, so a window shorter than thirty days is expected, not a fault.
  const missing = daysBetween(oldest, newest).filter((day) => !days.has(day));
  if (missing.length) {
    problems.push(
      `${missing.length} night(s) inside ${oldest}..${newest} produced no archive: ${missing.join(", ")}`
    );
  }

  // Freshness. A bucket full of correct, old backups is still a stopped job.
  const ageHours = (now.getTime() - new Date(`${newest}T00:00:00Z`).getTime()) / 3_600_000;
  if (ageHours > staleHours) {
    problems.push(
      `the newest archive is dated ${newest}, ${Math.floor(ageHours / 24)} day(s) ago — the nightly job has stopped`
    );
  }

  // A sudden shrink, measured against this bucket's own median so the threshold
  // does not need maintaining as the database grows.
  const typical = median(entries.map((e) => e.size));
  const small = entries.filter((e) => e.size < typical * shrinkRatio);
  if (small.length) {
    problems.push(
      `${small.length} archive(s) are under ${Math.round(shrinkRatio * 100)}% of the median ${typical} bytes: ` +
        small.map((e) => `${e.day} (${e.size}B)`).join(", ")
    );
  }

  // Two archives on one day is not a fault — a re-run makes one — but it is
  // worth saying, because it is also what a doubled schedule looks like.
  const duplicated = [...days].filter((day) => entries.filter((e) => e.day === day).length > 1);
  if (duplicated.length) notes.push(`more than one archive on: ${duplicated.join(", ")}`);

  return { ok: problems.length === 0, entries, oldest, newest, missing, typical, problems, notes };
}

export function report(result) {
  const lines = [];
  if (result.entries.length) {
    lines.push(
      `${result.entries.length} archive(s), ${result.oldest} to ${result.newest}, median ${result.typical} bytes`
    );
  }
  for (const note of result.notes) lines.push(`  note: ${note}`);
  for (const problem of result.problems) lines.push(`  PROBLEM: ${problem}`);
  lines.push(result.ok ? "The backups are present and unbroken." : "The backups are NOT what they should be.");
  return lines.join("\n");
}

export function main(argv) {
  const path = argv[0];
  const listing = path && path !== "-" ? readFileSync(path, "utf8") : readFileSync(0, "utf8");
  const result = inventory(listing);
  process.stdout.write(`${report(result)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("backup-inventory.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
