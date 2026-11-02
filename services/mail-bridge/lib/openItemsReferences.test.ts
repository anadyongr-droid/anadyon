import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every open-item identifier this service's documents cite must exist in
 * `docs/OPEN-ITEMS.md` **on the same branch**.
 *
 * **Why this exists.** On 27 October I told Tasos a review's findings were
 * "recorded as W73 on both branches". They were on one. Codex checked and found
 * the other branch had no W73 at all, which is the second time in that sequence
 * I reported something about my own work that was not so — both times a claim
 * about the record rather than a defect in the code.
 *
 * A cross-branch assertion is not possible from inside one checkout, so this
 * asserts the half that is: a document here may not point at an item that is
 * not here. The failure it catches is the common one — code and its item
 * recorded on different branches, where the branch carrying the work reads as
 * if the reasoning travels with it.
 */
const ID = /\b([WEMBRNFL]\d{1,3})\b/g;

function markdownUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...markdownUnder(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

describe("the service's documents cite items that exist on this branch", () => {
  const openItems = readFileSync("docs/OPEN-ITEMS.md", "utf8");
  const defined = new Set(
    Array.from(openItems.matchAll(/^\|\s*(?:~~)?([A-Z]+\d{1,3})(?:~~)?\s*\|/gm), (m) => m[1]),
  );

  it("finds the open items file and some items in it", () => {
    expect(defined.size).toBeGreaterThan(20);
  });

  for (const file of markdownUnder("services/mail-bridge")) {
    it(`${file} cites no missing item`, () => {
      const text = readFileSync(file, "utf8");
      const cited = new Set(Array.from(text.matchAll(ID), (m) => m[1]));
      const missing = [...cited].filter((id) => !defined.has(id));
      expect(missing).toEqual([]);
    });
  }
});
