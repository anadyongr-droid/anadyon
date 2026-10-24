import { describe, expect, it } from "vitest";
import { alertMessage } from "../scripts/restore-drill-alert.mjs";

/**
 * What the restore drill tells a person when it fails.
 *
 * **Written because the first one was wrong.** On 20 October 2026 the drill's
 * first real run failed on its own classifier — `auth` and `storage` errors it
 * did not yet know to expect — and sent *"The backups may be unrecoverable."*
 * The same run had restored 29 of 29 tables and 1,742 of 1,744 rows. Tasos
 * asked whether that was valid information. It was not: the alarm was real and
 * the diagnosis inside it was invented by the wording.
 *
 * `backup.yml` already records why this is more than a clumsy sentence — a
 * channel whose messages overstate gets skimmed, and the one that matters is
 * skimmed with it. So the three cases must stay apart, and these tests are
 * what keeps them apart.
 */

const summary = "  29 table(s) restored, 29 in production; 1742 rows restored against 1744 live";

const verdict = (...lines: string[]) =>
  ["restored anadyon-2026-10-20T01-58-16Z.tar.gz.enc", summary, ...lines].join("\n");

describe("the run that actually happened", () => {
  const message = alertMessage(
    verdict(
      '  RESTORE ERROR: psql:restored/data.sql:28: ERROR:  relation "auth.audit_log_entries" does not exist',
      "The archive did NOT restore usably."
    )
  );

  it("says the data came back, because it did", () => {
    expect(message).toContain("The data itself came back");
    expect(message).toContain("1742 rows restored against 1744 live");
  });

  it("does not tell anyone their backups may be gone", () => {
    // Matching on the claim, not on the words: the message says "this is not
    // a lost backup" on purpose, and a regex for `lost backup` fails on the
    // reassurance it is meant to be checking for.
    expect(message).not.toMatch(/unrecoverable|may be (gone|lost)/i);
    expect(message).toContain("this is not a lost backup");
  });
});

describe("the run we would actually need to hear about", () => {
  const message = alertMessage(
    verdict(
      "  PROBLEM: 1 table(s) hold rows in production and none in the restore: reservations (412 → 0)",
      "The archive did NOT restore usably."
    )
  );

  it("leads with the data, not with the error count", () => {
    expect(message).toContain("Data did not come back");
  });

  it("names the table and the numbers, so the message is actionable on its own", () => {
    // The alert is read on a phone, away from the run log. A reader who has
    // to open GitHub to learn which table is missing has been woken up for
    // nothing they can act on.
    expect(message).toContain("reservations (412 → 0)");
  });
});

describe("a drill that never got far enough to judge", () => {
  it("says so, rather than implying the archive is bad", () => {
    // Failing to fetch or decrypt is serious and is NOT evidence about the
    // archive's contents. Claiming otherwise is the same error as before,
    // pointed the other way.
    const message = alertMessage(null);
    expect(message).toContain("could not complete");
    expect(message).toMatch(/says nothing yet about whether the archive is good/);
    expect(message).not.toMatch(/unrecoverable/i);
  });

  it("treats an empty verdict file the same way", () => {
    expect(alertMessage("")).toContain("could not complete");
  });
});

describe("every message", () => {
  it.each([
    ["data loss", verdict("  PROBLEM: reservations (412 → 0)")],
    ["schema errors", verdict("  RESTORE ERROR: x")],
    ["no verdict", null],
  ])("%s still says the drill failed", (_label, input) => {
    expect(alertMessage(input as string | null)).toContain("Restore drill failed");
  });
});
