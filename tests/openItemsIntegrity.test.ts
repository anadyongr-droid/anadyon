import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every item in the open items log has exactly one identifier, and every
 * identifier names exactly one item.
 *
 * **Why this is a test and not a convention.** `DEFINING-STATEMENTS.md` §12
 * makes [`docs/OPEN-ITEMS.md`](../docs/OPEN-ITEMS.md) the first thing an agent
 * reads and the only durable record of what is outstanding, with a named owner
 * per row. An identifier is how one item is referred to from a worklog, a PR, a
 * commit message or another document — so a duplicated identifier does not just
 * look untidy. It makes a reference ambiguous, and an ambiguous reference is
 * read as whichever row the reader finds first.
 *
 * **It had already happened, six times over, on 3 October 2026.** That day's
 * additions were numbered E21–E26 and W30 while an E21–E25 block and a W30
 * already existed further down the file, so "E24" named both the Chrome path
 * test and monitoring environment separation, and the day's own worklog cited
 * the new numbers while the list answered with the old. Two of the six were
 * worse than ambiguous: **both E21 rows were about the same subject** — the
 * required merge checks on `main` — one verified first-hand and one not, which
 * is the parallel-document failure §9 exists to prevent, reproduced inside a
 * single file. They are now one row.
 *
 * Codex's 3 October review found the contradictions inside individual rows. This
 * is the structural half of the same finding, and it is the half a reader cannot
 * spot by reading: nobody scrolls 200 rows to check whether an identifier is
 * free, which is exactly why it needs a machine.
 */
const DOC = "docs/OPEN-ITEMS.md";

/** `| E24 | **Fire one test…` and `| ~~W26~~ | ~~**Closed…` both count. */
function itemIds(text: string): { id: string; line: number }[] {
  const found: { id: string; line: number }[] = [];
  text.split("\n").forEach((line, index) => {
    const match = /^\|\s*~*([A-Z][0-9]+)~*\s*\|/.exec(line);
    if (match) found.push({ id: match[1], line: index + 1 });
  });
  return found;
}

describe("the open items log has unambiguous identifiers", () => {
  const text = readFileSync(DOC, "utf8");
  const items = itemIds(text);

  it("finds the rows at all, so nothing below passes vacuously", () => {
    // The file is a set of Markdown tables. If the row shape ever changes, this
    // fails loudly rather than reporting a clean list of zero items.
    expect(items.length).toBeGreaterThan(50);
  });

  it("gives each identifier to exactly one row", () => {
    const seen = new Map<string, number[]>();
    for (const { id, line } of items) seen.set(id, [...(seen.get(id) ?? []), line]);

    const duplicated = [...seen.entries()]
      .filter(([, lines]) => lines.length > 1)
      .map(([id, lines]) => `${id} on lines ${lines.join(" and ")}`);

    expect(
      duplicated,
      `${DOC} reuses these identifiers, so a reference to one of them is ambiguous: ${duplicated.join("; ")}. Give the newer row the next free number in its series, or — if the two rows are about the same subject — merge them, which is what the two E21 rows needed.`,
    ).toEqual([]);
  });

  it("gives every row an owner", () => {
    // §12: "An item with no owner is how something sits untouched for a month
    // while each party assumes the other has it."
    const ownerless = text
      .split("\n")
      .filter((line) => /^\|\s*~*[A-Z][0-9]+~*\s*\|/.test(line))
      .filter((line) => {
        const cells = line.split("|").map((cell) => cell.trim());
        const owner = cells[cells.length - 2] ?? "";
        return owner === "" || owner === "—" || owner === "-";
      })
      .map((line) => line.slice(0, 40));

    expect(ownerless, `rows with no owner: ${ownerless.join(" / ")}`).toEqual([]);
  });
});
