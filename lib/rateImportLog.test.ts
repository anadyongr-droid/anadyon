import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

import { importLogKey } from "./rateImportLog";
import { describeSource, RATE_SOURCES } from "./rateSourceFreshness";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");

const QUERY = read("lib/rateSourceFreshnessQuery.ts");
const CARD = read("app/admin/components/CompetitorRatesCard.tsx");
const MARKET = read("app/admin/market/page.tsx");
const SCRAPE = read("app/api/admin/competitors/scrape/route.ts");
const FAROS = read("app/api/admin/competitors/faros/route.ts");
const CARRENTALS = read("app/api/admin/competitors/carrentals/route.ts");

describe("an import is dated by when it finished, not by the newest row", () => {
  it("keys one setting per source", () => {
    expect(importLogKey("faros")).toBe("rate_import:faros");
  });

  it("the query prefers the recorded time and only then falls back", () => {
    // MAX(scraped_at) answers "when was the newest row last written", which is
    // not the same question: rows are upserted, so re-touching one moves its
    // timestamp with no new data. That is what reported an import run
    // yesterday as having run today.
    const fn = QUERY.slice(QUERY.indexOf("export async function loadRateFreshness"));
    const recordedAt = fn.indexOf("log.get(src.source)");
    const fallbackAt = fn.indexOf('.from("competitor_rates")');
    expect(recordedAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeGreaterThan(recordedAt);
    expect(fn).toMatch(/if \(recorded\) return describeSource/);
  });

  it("a fallback date is flagged, never passed off as recorded", () => {
    const derived = describeSource(RATE_SOURCES[0], "2026-09-28T10:00:00Z", new Date("2026-09-29T10:00:00Z"), undefined, true);
    const recorded = describeSource(RATE_SOURCES[0], "2026-09-28T10:00:00Z", new Date("2026-09-29T10:00:00Z"));
    expect(derived.derived).toBe(true);
    expect(recorded.derived).toBe(false);
  });

  it("a source that has never run is not flagged as derived", () => {
    // `derived` qualifies a date. With no date there is nothing to qualify,
    // and "never imported (from the newest stored price)" is nonsense.
    const none = describeSource(RATE_SOURCES[0], null, new Date(), undefined, true);
    expect(none.derived).toBe(false);
    expect(none.lastImported).toBeNull();
  });

  it("the screen says when a date is derived", () => {
    expect(CARD).toMatch(/source\.derived/);
    expect(CARD).toMatch(/from the newest stored price/);
  });
});

describe("completion is recorded only when a pass actually completes", () => {
  it("EzCar and Podilatadiko are recorded inside the done branch", () => {
    // A partial batch has refreshed some searches and not others. Dating the
    // import from it would overstate how current the prices are, which is the
    // defect the log replaces.
    const done = SCRAPE.slice(SCRAPE.indexOf("if (done) {"));
    const block = done.slice(0, done.indexOf("\n  }\n"));
    expect(block).toContain('recordImportCompleted("ezcar")');
    expect(block).toContain('recordImportCompleted("podilatadiko")');
  });

  it("Faros and CarRentals are recorded on ingest, not on starting the run", () => {
    // The Apify run finishing is not the same as the prices being stored:
    // ingestion happens in the polling GET, and an abandoned poll stores
    // nothing at all.
    expect(FAROS).toMatch(/ingestFarosDataset[\s\S]{0,200}recordImportCompleted\("faros"\)/);
    expect(CARRENTALS).toMatch(/ingestDataset[\s\S]{0,200}recordImportCompleted\("carrentals"\)/);
  });

  it("nothing is recorded from a POST that only starts a run", () => {
    const post = FAROS.slice(FAROS.indexOf("export async function POST"), FAROS.indexOf("export async function GET"));
    expect(post).not.toContain("recordImportCompleted");
  });
});

describe("neither screen renders nothing when the data is unavailable", () => {
  // Both returned null, so a failed request left the screens looking exactly
  // as they did before the feature existed — reported as "I still don't see
  // the import date". Blueprint §5.3: degraded state is shown, not hidden.
  it("the settings card shows a message instead of vanishing", () => {
    const fn = CARD.slice(CARD.indexOf("function LastImported"));
    const guard = fn.slice(0, fn.indexOf("const tone"));
    expect(guard).not.toMatch(/if \(!source\) return null/);
    expect(guard).toMatch(/unavailable/i);
  });

  it("the market panel shows a message instead of vanishing", () => {
    expect(MARKET).not.toMatch(/if \(!sources\.length\) return null/);
    expect(MARKET).toMatch(/Could not read when the competitor rates were last imported/);
  });

  it("both messages use a colour that clears WCAG AA", () => {
    for (const [name, src] of [["card", CARD], ["market", MARKET]] as const) {
      const panel = src.slice(src.indexOf(name === "card" ? "function LastImported" : "function FreshnessPanel"));
      expect(panel, name).not.toMatch(/(?<!dark:)text-gray-[34]00/);
    }
  });
});
