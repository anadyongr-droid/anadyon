import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The repricing panel proposes prices. `DEFINING-STATEMENTS.md` §13 puts prices
 * first on the list of things an agent may draft but not deploy without Tasos's
 * explicit approval of that specific change, so the safeguard is that the panel
 * has no way to write one — not that it currently chooses not to.
 *
 * Asserted against the source rather than by rendering, because this project's
 * Vitest runs in `node` with no DOM and a rendering test would prove only that
 * one path did not save.
 */
const PANEL = new URL("../app/admin/market/RepricingPanel.tsx", import.meta.url).pathname;
const src = readFileSync(PANEL, "utf8");

describe("the repricing panel cannot write a price", () => {
  it("makes no network call at all", () => {
    // Not "makes no PATCH": a POST to some other route that happened to write
    // rates would pass that, and the point is that the panel owns no write path
    // of any kind. Everything it needs is already on the screen.
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  it("names no mutating method", () => {
    expect(src).not.toContain("PATCH");
    expect(src).not.toContain("POST");
  });

  it("does not reach the rates API", () => {
    expect(src).not.toContain("/api/admin/rates");
  });

  it("says out loud that saving is the operator's own action", () => {
    // The screen's honesty about this is the other half of §13: a preview that
    // looked like it had already taken effect would be one press from a price
    // change nobody approved.
    expect(src).toContain("Nothing is written until you");
  });
});

describe("the arithmetic is not reimplemented in the component", () => {
  it("delegates to lib/targetPricing", () => {
    expect(src).toContain('from "@/lib/targetPricing"');
  });

  it("does not compute a target price of its own", () => {
    // A second copy of the rule inside a component is a copy nothing tests —
    // and the node-environment Vitest here cannot render one to find out.
    expect(src).not.toMatch(/deltaPct\s*\/\s*100/);
    expect(src).not.toMatch(/Math\.round\s*\([^)]*roundTo/);
  });
});
