import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The rules agents are bound by must live where agents actually read them.
 *
 * `CLAUDE.md` is one line — `@AGENTS.md` — so AGENTS.md is the only document
 * loaded into an agent's context automatically. `DEFINING-STATEMENTS.md` is
 * not: an agent sees it only if something tells it to look.
 *
 * On 19 September 2026 customer-facing insurance wording was prepared for merge
 * without being discussed. Tasos rolled it back and wrote §13, requiring his
 * explicit approval for changes to the operating model or the customer
 * relationship. §13 was written correctly and then sat unreferenced for a day
 * while AGENTS.md — the file that loads — still told agents to decide such
 * things themselves. The rule existed and did not bind.
 *
 * This asserts the wiring, not the wording. It cannot check that an agent obeys
 * §13; it checks that an agent is shown it, which is the part that failed.
 */
const AGENTS = readFileSync("AGENTS.md", "utf8");
const STATEMENTS = readFileSync("DEFINING-STATEMENTS.md", "utf8");
const CLAUDE_MD = readFileSync("CLAUDE.md", "utf8");

describe("governance wiring", () => {
  it("CLAUDE.md still pulls in AGENTS.md", () => {
    // If this stops being true the whole premise changes: AGENTS.md would no
    // longer be the auto-loaded file, and the assertions below would be
    // guarding the wrong document.
    expect(CLAUDE_MD).toContain("@AGENTS.md");
  });

  it("every DEFINING-STATEMENTS section AGENTS.md cites actually exists", () => {
    const cited = [...AGENTS.matchAll(/§(\d+)/g)].map((m) => Number(m[1]));
    expect(cited.length).toBeGreaterThan(0);

    const missing = [...new Set(cited)].filter(
      (n) => !new RegExp(`^##\\s*${n}\\.`, "m").test(STATEMENTS),
    );
    expect(missing, `AGENTS.md cites §${missing.join(", §")}, which DEFINING-STATEMENTS.md does not define`).toEqual([]);
  });

  it("the approval boundary is visible in the file agents auto-load", () => {
    // §13 is the one rule whose entire value is that it is seen before a merge,
    // not discovered afterwards. Asserted by number and by substance, because a
    // bare "§13" someone left behind while deleting the paragraph around it
    // would satisfy a reference check and teach an agent nothing.
    expect(AGENTS, "AGENTS.md must cite DEFINING-STATEMENTS.md §13").toContain("§13");
    expect(
      /explicit approval/i.test(AGENTS),
      "AGENTS.md must say that these changes need Tasos's explicit approval",
    ).toBe(true);
    expect(
      /operating model|customer relationship/i.test(AGENTS),
      "AGENTS.md must name what the approval boundary covers",
    ).toBe(true);
  });

  it("§13 is defined, and says approval is required before merge or deploy", () => {
    expect(STATEMENTS).toMatch(/^##\s*13\./m);
    const section = STATEMENTS.slice(STATEMENTS.search(/^##\s*13\./m));
    expect(/explicit approval/i.test(section)).toBe(true);
    expect(/merge|deploy/i.test(section)).toBe(true);
  });
});
