import { describe, expect, it } from "vitest";
import { daysBetween, inventory, parseListing } from "../scripts/backup-inventory.mjs";

/**
 * Whether the backups are actually in the bucket.
 *
 * **The question this answers was asked on 20 October 2026** — "have we been
 * creating backups for the last four weeks?" — and the two answers available
 * were both circumstantial: a run history of green ticks, which is the thing
 * that lied here before, and one prune line showing the thirty-first object
 * being deleted. Neither can distinguish thirty consecutive nights from a
 * fortnight of doubles and a fortnight of nothing.
 *
 * Every case below is built from the real listing format, and the fixtures use
 * a fixed `now` so a test that passes today still passes in March.
 */

const NOW = new Date("2026-10-20T12:00:00Z");

/** `aws s3 ls` output, one line per object. */
const line = (day: string, size = 164752, time = "01-58-16") =>
  `${day} 01:58:21     ${size} anadyon-${day}T${time}Z.tar.gz.enc`;

const nights = (from: string, to: string, size = 164752) =>
  daysBetween(from, to)
    .map((d: string) => line(d, size))
    .join("\n");

describe("reading an aws s3 ls listing", () => {
  it("takes the day out of the key, not out of the modified column", () => {
    // These differ by design: the object is written minutes after the stamp,
    // and a re-upload would move the modified date while the archive still
    // belongs to the night it was taken.
    const listing = "2026-10-21 04:00:00     164752 anadyon-2026-10-20T01-58-16Z.tar.gz.enc";
    expect(parseListing(listing)).toEqual([
      { key: "anadyon-2026-10-20T01-58-16Z.tar.gz.enc", day: "2026-10-20", size: 164752 },
    ]);
  });

  it("ignores anything that is not a backup archive", () => {
    const listing = [
      "                           PRE monthly/",
      "2026-10-20 01:58:21        128 readme.txt",
      line("2026-10-20"),
    ].join("\n");
    expect(parseListing(listing)).toHaveLength(1);
  });

  it("returns them oldest first whatever order they arrived in", () => {
    const listing = [line("2026-10-20"), line("2026-10-18"), line("2026-10-19")].join("\n");
    expect(parseListing(listing).map((e) => e.day)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
  });
});

describe("thirty unbroken nights", () => {
  const result = inventory(nights("2026-09-21", "2026-10-20"), { now: NOW });

  it("is the answer to the question that was asked", () => {
    expect(result.ok).toBe(true);
    expect(result.entries).toHaveLength(30);
    expect(result.oldest).toBe("2026-09-21");
    expect(result.newest).toBe("2026-10-20");
    expect(result.missing).toEqual([]);
  });

  it("does not complain that the window is only thirty days", () => {
    // Retention keeps thirty dailies, so the old end is trimmed on purpose.
    // Treating that as a gap would make this check cry wolf every single night.
    expect(result.problems).toEqual([]);
  });
});

describe("the three ways it must not stay quiet", () => {
  it("names the night that produced nothing", () => {
    const withGap = daysBetween("2026-09-21", "2026-10-20")
      .filter((d: string) => d !== "2026-10-05")
      .map((d: string) => line(d))
      .join("\n");
    const result = inventory(withGap, { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["2026-10-05"]);
    expect(result.problems[0]).toContain("2026-10-05");
  });

  it("catches a job that stopped, even when every archive it did take is perfect", () => {
    const result = inventory(nights("2026-09-01", "2026-09-30"), { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("the nightly job has stopped");
  });

  it("catches an archive that shrank by an order of magnitude", () => {
    // The dump guard refuses a file under 100 bytes, but it runs before
    // compression and cannot see an archive that lost a table.
    const listing = `${nights("2026-10-01", "2026-10-19")}\n${line("2026-10-20", 900)}`;
    const result = inventory(listing, { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("2026-10-20 (900B)");
  });

  it("refuses to call an empty bucket healthy", () => {
    const result = inventory("", { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("no backup archive at all");
  });
});

describe("what it reports without failing", () => {
  it("mentions two archives on one day rather than treating it as a fault", () => {
    // A re-run makes a second one, and that is fine. A doubled schedule also
    // makes a second one, and that is not — so it is said, not enforced.
    const listing = `${nights("2026-10-01", "2026-10-20")}\n${line("2026-10-20", 164752, "09-02-00")}`;
    const result = inventory(listing, { now: NOW });
    expect(result.ok).toBe(true);
    expect(result.notes.join(" ")).toContain("2026-10-20");
  });

  it("allows a late run that crossed midnight", () => {
    // 48 hours rather than 24: the job starts at 23:30 UTC and has drifted
    // past midnight before, which must not read as a stopped schedule.
    const result = inventory(nights("2026-09-21", "2026-10-19"), { now: NOW });
    expect(result.ok).toBe(true);
  });
});
