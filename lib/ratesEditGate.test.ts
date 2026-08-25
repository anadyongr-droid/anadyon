import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The rate card is read far more often than it is changed.
 *
 * Every field was live the moment the page rendered, so on a phone a stray tap
 * on a number could alter a price with nothing to undo it. Rates now open
 * read-only and require Edit; Cancel restores what was last loaded or saved.
 *
 * The same page also had no loading state at all — it rendered its headings and
 * empty tables until the fetch resolved, which is what "only partially loading"
 * described.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");
const rates = read("app/admin/rates/page.tsx");
const market = read("app/admin/market/page.tsx");

describe("rates open read-only", () => {
  it("editing is off until it is asked for", () => {
    expect(rates).toMatch(/const \[editing, setEditing\] = useState\(false\)/);
  });

  it("permission and intent are both required to type", () => {
    // isAdmin alone is not enough — that only says the user *may* edit.
    expect(rates).toMatch(/const canEdit = isAdmin && editing/);
  });

  it("every editable control follows canEdit, not the role alone", () => {
    const gated = rates.match(/(readOnly|disabled)=\{!canEdit\}/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(3);
    expect(rates, "a control still keyed only to the role stays live on load")
      .not.toMatch(/(readOnly|disabled)=\{!isAdmin\}/);
  });

  it("offers Edit, then Save and Cancel", () => {
    expect(rates).toContain("Edit rates");
    expect(rates).toContain("Save changes");
    expect(rates).toContain("Cancel");
  });

  it("Cancel restores the last loaded or saved values", () => {
    expect(rates).toMatch(/function cancelEdit\(\)[\s\S]{0,140}setRates\(pristine\.rates\)/);
    expect(rates).toMatch(/setExtras\(pristine\.extras\)/);
  });

  it("a save becomes the new baseline and closes the session", () => {
    // Otherwise Cancel would later revert to values already written to the
    // database, and the fields would stay live behind the user.
    expect(rates).toMatch(/setPristine\(\{ rates, extras \}\)/);
    expect(rates).toMatch(/setPristine[\s\S]{0,80}setEditing\(false\)/);
  });

  it("staff still see the view-only notice rather than a button", () => {
    expect(rates).toContain("View only — rates are set by an administrator");
  });

  it("the buttons meet the touch-target minimum", () => {
    expect((rates.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("the screens say when they are still loading", () => {
  it("rates has a loading state at all", () => {
    expect(rates).toMatch(/const \[loading, setLoading\] = useState\(true\)/);
    expect(rates).toContain("Loading rates…");
  });

  it("rates renders nothing half-formed while it waits", () => {
    // The tables are behind the flag, so no empty grid is shown first.
    expect(rates).toMatch(/\{!loading && !loadError && \(/);
  });

  it("rates surfaces a failed load instead of an empty page", () => {
    expect(rates).toMatch(/const \[loadError, setLoadError\]/);
    expect(rates).toMatch(/Reload the page to try again/);
  });

  it("the load is cancelled if the screen goes away", () => {
    expect(rates).toMatch(/let cancelled = false/);
    expect(rates).toMatch(/return \(\) => \{ cancelled = true; \}/);
  });
});

describe("market does not wait on itself", () => {
  it("mapping and comparison are fetched together", () => {
    // They do not depend on each other; awaiting one before starting the other
    // made the screen wait for two round trips in series.
    expect(market).toMatch(/await Promise\.all\(\[/);
    expect(market).not.toMatch(/setGroups\(\(await res\.json\(\)\)\.groups \?\? \[\]\);\s*\n\s*await loadComparison\(\);/);
  });
});
