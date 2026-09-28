import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGEING_AFTER_DAYS,
  RATE_SOURCES,
  STALE_AFTER_DAYS,
  ageInDays,
  classifyAge,
  formatImportDate,
  describeSource,
  relativeAge,
  summariseFreshness,
} from "./rateSourceFreshness";

const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const NOW = new Date("2026-09-28T12:00:00Z");
const daysBefore = (n: number, hours = 0) =>
  new Date(NOW.getTime() - n * 86_400_000 - hours * 3_600_000).toISOString();

describe("age is counted in calendar days, so it agrees with the date shown", () => {
  // The defect this replaces, reported from the live screen on 28 September:
  //
  //   Ionian Rentals & Motor Club Zante   17 Aug 2026 · 42 days ago
  //   Faros Rentals                       16 Aug 2026 · 42 days ago
  //
  // Two different dates, the same age. Under elapsed-24-hour arithmetic both
  // are "correct" — the 16 August import simply happened late enough in the
  // day that fewer than 43×24 hours had passed — but one of the two lines is
  // wrong on its face and the reader cannot tell which.
  const AUG_16_LATE = "2026-08-16T20:30:00+03:00";
  const AUG_17_EARLY = "2026-08-17T00:30:00+03:00";
  const LOOKED_AT = new Date("2026-09-28T17:00:00+03:00");

  it("REPRODUCES: the two timestamps really are on different Athens dates", () => {
    // Asserting the precondition first, so this cannot pass against a repro
    // that could not exhibit the bug in the first place.
    expect(formatImportDate(AUG_16_LATE)).toBe("16 Aug 2026");
    expect(formatImportDate(AUG_17_EARLY)).toBe("17 Aug 2026");
    // ...and that they are under four hours apart, which is what made the old
    // elapsed-time arithmetic collapse them onto one number.
    const gapHours =
      (new Date(AUG_17_EARLY).getTime() - new Date(AUG_16_LATE).getTime()) / 3_600_000;
    expect(gapHours).toBeLessThanOrEqual(4);
  });

  it("gives dates one day apart ages one day apart", () => {
    expect(ageInDays(AUG_17_EARLY, LOOKED_AT)).toBe(42);
    expect(ageInDays(AUG_16_LATE, LOOKED_AT)).toBe(43);
  });

  it("counts a same-day import as zero, whatever the hour", () => {
    expect(ageInDays("2026-09-28T00:05:00+03:00", LOOKED_AT)).toBe(0);
    expect(ageInDays("2026-09-28T23:55:00+03:00", LOOKED_AT)).toBe(0);
  });

  it("counts yesterday as one even when only minutes have elapsed", () => {
    // 23:55 to 00:05 is ten minutes and one calendar day. Elapsed arithmetic
    // called this zero, so an overnight import read as "today".
    expect(ageInDays("2026-09-27T23:55:00+03:00", new Date("2026-09-28T00:05:00+03:00"))).toBe(1);
  });

  it("is unaffected by the viewer's own timezone", () => {
    // The age used to be computed on the server in UTC while the date was
    // formatted in the browser's zone, so the pair could disagree by a day for
    // anyone outside Greece even with nothing near midnight.
    const original = process.env.TZ;
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(ageInDays(AUG_16_LATE, LOOKED_AT), tz).toBe(43);
      expect(formatImportDate(AUG_16_LATE), tz).toBe("16 Aug 2026");
    }
    process.env.TZ = original;
  });

  it("counts a day across the October DST change as one day", () => {
    // Europe/Athens falls back on 25 October 2026, making that day 25 hours
    // long. Dividing elapsed milliseconds would floor it to 1 only by luck.
    expect(ageInDays("2026-10-24T12:00:00+03:00", new Date("2026-10-25T12:00:00+02:00"))).toBe(1);
  });

  it("clamps a future timestamp to zero instead of going negative", () => {
    // Clock skew between the database and the server is the realistic cause.
    // Without the clamp this renders as "-1 days ago".
    const future = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(ageInDays(future, NOW)).toBe(0);
  });

  it("reports null for a source that was never imported", () => {
    expect(ageInDays(null, NOW)).toBeNull();
  });

  it("reports null rather than NaN for an unparseable timestamp", () => {
    expect(ageInDays("not a date", NOW)).toBeNull();
  });
});

describe("the bands are inclusive of their own boundary", () => {
  it.each([
    [0, "fresh"],
    [AGEING_AFTER_DAYS, "fresh"],
    [AGEING_AFTER_DAYS + 1, "ageing"],
    [STALE_AFTER_DAYS, "ageing"],
    [STALE_AFTER_DAYS + 1, "stale"],
  ])("%s days old is %s", (days, expected) => {
    expect(classifyAge(days as number)).toBe(expected);
  });

  it("never imported is its own state, not merely very old", () => {
    expect(classifyAge(null)).toBe("never");
  });
});

describe("describeSource", () => {
  it("carries the timestamp through when it parses", () => {
    const iso = daysBefore(10);
    const d = describeSource(RATE_SOURCES[0], iso, NOW);
    expect(d).toMatchObject({
      source: RATE_SOURCES[0].source,
      lastImported: iso,
      ageDays: 10,
      staleness: "ageing",
    });
    // The label is produced beside the age, from the same clock, so a caller
    // cannot render one without the other.
    expect(d.lastImportedLabel).toBe(formatImportDate(iso));
  });

  it("drops a timestamp it could not parse, so the UI shows 'never' not 'NaN days'", () => {
    const d = describeSource(RATE_SOURCES[0], "31/02/2026", NOW);
    expect(d.lastImported).toBeNull();
    expect(d.lastImportedLabel).toBeNull();
    expect(d.staleness).toBe("never");
  });
});

describe("the headline reports the oldest source, not the newest", () => {
  const fresh = describeSource(RATE_SOURCES[0], daysBefore(1), NOW);
  const old = describeSource(RATE_SOURCES[1], daysBefore(95), NOW);

  it("a fresh import does not make a stale one look current", () => {
    // This is the whole point of the panel. Averaging, or taking the newest,
    // would let one morning's EzCar run vouch for a three-month-old Faros
    // column that sits in the same comparison grid.
    const s = summariseFreshness([fresh, old]);
    expect(s.oldestAgeDays).toBe(95);
    expect(s.staleness).toBe("stale");
  });

  it("a source that has never run outranks any age", () => {
    const never = describeSource(RATE_SOURCES[2], null, NOW);
    const s = summariseFreshness([fresh, never]);
    expect(s.staleness).toBe("never");
    expect(s.neverImported).toEqual([RATE_SOURCES[2].label]);
  });

  it("reports nothing rather than zero when no source has ever run", () => {
    const s = summariseFreshness(RATE_SOURCES.map(r => describeSource(r, null, NOW)));
    expect(s.oldestAgeDays).toBeNull();
    expect(s.neverImported).toHaveLength(RATE_SOURCES.length);
  });
});

describe("relativeAge reads as English", () => {
  it.each([
    [0, "today"],
    [1, "yesterday"],
    [17, "17 days ago"],
    [null, "never imported"],
  ])("%s -> %s", (days, expected) => {
    expect(relativeAge(days as number | null)).toBe(expected);
  });
});

describe("every importer is represented", () => {
  // The registry is hand-maintained so that a source which has never run still
  // appears. That only holds while it matches the importers — an importer added
  // without a row here would be invisible on the screen, which is the exact
  // failure the panel exists to prevent.
  const importerSources = [
    ["lib/competitorRates.ts", "ezcar"],
    ["lib/farosRates.ts", "faros"],
    ["lib/carRentalsRates.ts", "carrentals"],
    ["lib/podilatadikoRates.ts", "podilatadiko"],
  ] as const;

  it.each(importerSources)("%s writes source '%s', and the registry lists it", (file, source) => {
    expect(read(file), `${file} no longer writes source: "${source}"`)
      .toContain(`source: "${source}"`);
    expect(RATE_SOURCES.map(r => r.source)).toContain(source);
  });

  it("lists no source that no importer writes", () => {
    const written = new Set(importerSources.map(([, s]) => s));
    expect(RATE_SOURCES.filter(r => !written.has(r.source as never))).toEqual([]);
  });
});

describe("the freshness reaches the screen", () => {
  // Unit-testing the arithmetic proves nothing if the number never renders.
  // These two assertions are what actually failed before the panel existed.
  const route = read("app/api/admin/competitors/comparison/route.ts");
  const page = read("app/admin/market/page.tsx");

  it("the comparison API returns a per-source freshness list", () => {
    expect(route).toContain("loadFreshness");
    expect(route, "the response must carry `sources`").toMatch(/\bsources,/);
  });

  it("freshness is read independently of whether a category is mapped", () => {
    // The observation query filters on pricing_group; freshness must not, or a
    // completed import with nothing mapped yet would report as never run.
    //
    // The anchor is asserted before slicing on it. Without that, a renamed or
    // deleted function makes indexOf return -1, the slice yields an empty
    // string, and "" contains nothing — so this passes while testing nothing.
    // It did exactly that when run against the unwired code.
    const start = route.indexOf("async function loadFreshness");
    expect(start, "loadFreshness is gone — this test no longer checks anything").toBeGreaterThan(-1);
    const body = route.slice(start);
    const end = body.indexOf("}\n\n");
    expect(end, "could not find the end of loadFreshness").toBeGreaterThan(-1);
    expect(body.slice(0, end)).not.toContain("pricing_group");
  });

  it("the Market screen renders it", () => {
    expect(page).toContain("FreshnessPanel");
    // The date is taken from the server, not reformatted in the browser.
    expect(page, "the page must not re-derive the date from its own clock")
      .not.toMatch(/toLocaleDateString/);
    expect(page).toContain("s.lastImportedLabel");
    expect(page, "the panel must be placed in the page body")
      .toMatch(/<FreshnessPanel\s+sources=\{sources\}\s*\/>/);
  });

  it("the panel avoids the greys that fail WCAG AA", () => {
    // adminReadability.test.ts enforces this repo-wide; asserted here too so a
    // change to this panel names itself rather than failing in another file.
    const start = page.indexOf("function FreshnessPanel");
    expect(start, "the panel is gone — this test no longer checks anything").toBeGreaterThan(-1);
    expect(page.slice(start)).not.toMatch(/(?<!dark:)text-gray-[34]00/);
  });
});
