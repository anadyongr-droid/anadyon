import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");

const CARD = read("app/admin/components/CompetitorRatesCard.tsx");
const ROUTE = read("app/api/admin/competitors/freshness/route.ts");
const COMPARISON = read("app/api/admin/competitors/comparison/route.ts");
const QUERY = read("lib/rateSourceFreshnessQuery.ts");

describe("the import buttons say when they last ran", () => {
  it("every source the card can trigger shows a date", () => {
    // The decision to press a button is taken on this screen. Carrying the
    // dates only on Market is how three of four sources sat two months old
    // while looking fine from here.
    for (const source of ["ezcar", "podilatadiko", "faros", "carrentals"]) {
      expect(CARD, `no date rendered for ${source}`).toContain(`bySource("${source}")`);
    }
  });

  it("bicycles are shown under the pass that actually collects them", () => {
    // Podilatadiko has no button: it rides along on the final EzCar call. Its
    // date belongs beside that button, or the reader looks for a control that
    // does not exist — which is exactly what was asked about.
    const ezcar = CARD.indexOf('bySource("ezcar")');
    const podil = CARD.indexOf('bySource("podilatadiko")');
    const faros = CARD.indexOf('bySource("faros")');
    expect(ezcar).toBeGreaterThan(-1);
    expect(podil).toBeGreaterThan(ezcar);
    expect(podil, "podilatadiko must sit in the EzCar block, before Faros").toBeLessThan(faros);
    expect(CARD).toMatch(/collected at the end of this same pass/i);
  });

  it("reads its own endpoint rather than the comparison payload", () => {
    // The comparison route returns every observation and every rate. Asking it
    // for four dates would drag all of that across to render three lines.
    expect(CARD).toContain("/api/admin/competitors/freshness");
    expect(CARD).not.toContain("/api/admin/competitors/comparison");
  });

  it("a failed dates request does not blank the progress bar, or the reverse", () => {
    // Two separate try blocks, deliberately. One combined request means either
    // failure takes out both, and a missing progress bar during a four-minute
    // pass reads as "nothing is happening".
    const refresh = CARD.slice(CARD.indexOf("const refresh ="), CARD.indexOf("useEffect(()"));
    expect((refresh.match(/try \{/g) ?? []).length).toBe(2);
  });

  it("colours a stale source, and does not use the greys that fail WCAG AA", () => {
    const panel = CARD.slice(CARD.indexOf("function LastImported"));
    expect(panel).toMatch(/text-amber-700/);
    expect(panel).toMatch(/text-red-700/);
    expect(panel).not.toMatch(/(?<!dark:)text-gray-[34]00/);
  });
});

describe("one query, two screens", () => {
  it("the comparison route no longer carries its own copy", () => {
    // It did. Two routes with the same SQL drift, and the drift is invisible
    // because each looks correct on its own screen.
    expect(COMPARISON).toContain("loadRateFreshness");
    expect(COMPARISON, "the private copy is back").not.toContain("async function loadFreshness");
  });

  it("both routes call the shared query", () => {
    expect(ROUTE).toContain("loadRateFreshness");
    expect(COMPARISON).toContain('from "@/lib/rateSourceFreshnessQuery"');
  });

  it("the shared query is bounded per source, not an unbounded select", () => {
    // PostgREST caps an unbounded select at 1,000 rows silently, so a reduce
    // over a fetched page would report the wrong date once the table grew.
    expect(QUERY).toContain(".limit(1)");
    expect(QUERY).toMatch(/\.order\("scraped_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  });

  it("the settings endpoint is not cached", () => {
    // A cached answer on a screen whose whole purpose is "did my import just
    // run?" would be worse than showing nothing.
    expect(ROUTE).toContain('"Cache-Control": "no-store"');
    expect(ROUTE).toContain('export const dynamic = "force-dynamic"');
  });
});
