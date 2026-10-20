#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Builds the Telegram message for a failed restore drill, saying what the run
 * actually established rather than the worst thing it might mean.
 *
 * **Why this is its own file.** The first real drill, 20 October 2026, failed
 * because the classifier did not yet know that `auth` and `storage` errors are
 * expected outside Supabase — and the alert it sent read *"The backups may be
 * unrecoverable."* The same run had restored **29 of 29 tables and 1,742 of
 * 1,744 rows**. Tasos asked whether the message was valid information, which
 * it was not: the alarm was real, the diagnosis in it was invented by the
 * wording rather than found by the job.
 *
 * That matters more than a clumsy sentence. `backup.yml`'s own comment says a
 * nightly "backup succeeded" message trains the reader to ignore the channel;
 * an alert that announces a disaster during a *successful* restore does the
 * same thing faster, because the next real one is read as another false
 * alarm.
 *
 * So the message is built from the verdict file, and the three cases are kept
 * apart:
 *
 *   * **The data did not come back.** A table is missing, or empty where
 *     production has rows. This is the one that deserves alarming language.
 *   * **The restore hit errors in `public`.** Something in our own schema did
 *     not load. Serious, but the counts may still be fine, so it says so.
 *   * **The drill never got that far.** It could not fetch, decrypt or unpack
 *     — which says nothing yet about whether the archive is good, and must not
 *     claim it does.
 */

/** @param {string|null} verdict  contents of drill.txt, or null if absent */
export function alertMessage(verdict) {
  const text = verdict ?? "";
  const headline = (body) => `❌ <b>Restore drill failed</b>\n${body}`;

  if (!verdict || !/restore[sd]? /i.test(text)) {
    return headline(
      "The drill could not complete — it did not reach the point of restoring anything, so this says nothing yet about whether the archive is good. Check whether the archive could be fetched, decrypted and unpacked."
    );
  }

  const summary = text.split("\n").find((line) => /table\(s\) restored/.test(line))?.trim();
  const lost = text
    .split("\n")
    .filter((line) => /PROBLEM:/.test(line))
    .map((line) => line.replace(/.*PROBLEM:\s*/, "").trim());

  if (lost.length) {
    return headline(
      `Data did not come back from the newest off-site archive.\n${lost.join("\n")}` +
        (summary ? `\n${summary}` : "")
    );
  }

  // Errors in our own schema, but the counts came back. Real, and not a
  // reason to tell someone their backups are gone.
  return headline(
    `The restore reported errors in our own schema. The data itself came back:\n${summary ?? "see the run for the counts"}\nWorth reading before the next drill, but this is not a lost backup.`
  );
}

export function main(argv) {
  const path = argv[0];
  let verdict = null;
  try {
    verdict = readFileSync(path, "utf8");
  } catch {
    // Left null: the drill did not get as far as writing one.
  }
  process.stdout.write(alertMessage(verdict));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("restore-drill-alert.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
