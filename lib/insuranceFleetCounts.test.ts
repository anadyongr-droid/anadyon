import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The counts in `INSURANCE-COVER-AND-RESTRICTIONS.md` §1a must match its own
 * table.
 *
 * On 30 September 2026 that section was written from the broker's list of every
 * currently open policy. The table is right. The prose around it is not: it said
 * **nine** motorbikes run to 11 October where the table lists **eight** plates
 * on that date, and **seventeen** vehicles against a fleet of twenty-nine where
 * the table lists **sixteen** distinct plates — which makes the unexplained
 * remainder thirteen, not twelve.
 *
 * Both errors ran in the direction that flattered the fleet: one extra bike
 * accounted for, one fewer vehicle on unknown cover. They then propagated by
 * being read rather than recounted — into `OPEN-ITEMS.md` F1 and F2, into the
 * day's worklog, and from there into Codex's 2 October full-project audit, which
 * inherited the figures from the document rather than from the table.
 *
 * `DEFINING-STATEMENTS.md` §8 is the principle: a claim about the system is
 * verified, not assumed. A count is the cheapest possible claim to verify and
 * the easiest to get wrong once, because nothing re-reads it. So this counts the
 * table and holds the sentences to it.
 *
 * It deliberately does NOT check the table against the broker's email, which no
 * test here can reach — §1a already labels that table as the broker's assertion
 * rather than a certificate. This asserts internal consistency, and only that:
 * if the broker's list is itself wrong, this test keeps passing. It prevents the
 * specific failure that happened, which was arithmetic.
 *
 * The motorbike count — "eleven motorbikes where this document knew of two" —
 * is NOT checked here. It comes from the ΜΗΧΑΝΑΚΙΑ grouping in the broker's
 * email, which the reproduced table does not carry, so there is nothing in the
 * repository to count it against. §8 says label what cannot be checked; the
 * document now does, and this comment is the record that the omission is
 * deliberate rather than overlooked.
 */
const DOC = "docs/INSURANCE-COVER-AND-RESTRICTIONS.md";

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  "twenty-one": 21,
  "twenty-two": 22,
  "twenty-three": 23,
  "twenty-four": 24,
  "twenty-five": 25,
  "twenty-six": 26,
  "twenty-seven": 27,
  "twenty-eight": 28,
  "twenty-nine": 29,
  thirty: 30,
};

function spelled(word: string): number {
  const n = WORDS[word.toLowerCase()];
  expect(
    n,
    `"${word}" is not a number word this test knows; add it to WORDS rather than loosening the assertion`,
  ).toBeTypeOf("number");
  return n;
}

/** Strip the bold/italic markers Markdown puts around a figure. */
function plain(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "");
}

/**
 * The broker's table: `| ΖΒΒ 564 · ΖΒΒ 565 | 11 October | 11 |`.
 *
 * Rows carry one plate or several separated by `·`, so plates are counted, not
 * rows — counting rows is how "sixteen" could have been read as "ten".
 */
function brokerRows(doc: string): { plates: string[]; expires: string }[] {
  const start = doc.indexOf("### The broker's own list of what is currently open");
  expect(start, `${DOC} no longer contains the §1a heading this test reads`).toBeGreaterThan(-1);
  const after = doc.slice(start);
  const end = after.indexOf("\n## ");
  const section = end === -1 ? after : after.slice(0, end);

  const rows: { plates: string[]; expires: string }[] = [];
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((cell) => plain(cell).trim());
    // A data row is `| a | b | c |` → ["", a, b, c, ""].
    if (cells.length !== 5) continue;
    const [, first, expires, days] = cells;
    if (!/^\d+$/.test(days)) continue; // header and the `|---|` separator
    if (!/\d/.test(first)) continue;
    rows.push({
      plates: first
        .split("·")
        .map((plate) => plate.trim())
        .filter(Boolean),
      expires,
    });
  }
  return rows;
}

describe("insurance §1a counts match the broker's table", () => {
  const doc = readFileSync(DOC, "utf8");
  const rows = brokerRows(doc);
  const plates = rows.flatMap((row) => row.plates);
  const distinct = new Set(plates);

  it("finds the table at all", () => {
    // Guards against the assertions below passing vacuously on an empty parse.
    expect(rows.length).toBeGreaterThan(5);
    expect(distinct.size).toBeGreaterThan(rows.length);
  });

  it("lists every plate once", () => {
    expect(
      distinct.size,
      `the table repeats a plate: ${plates.join(", ")}`,
    ).toBe(plates.length);
  });

  it("agrees with the prose on how many expire on 11 October", () => {
    const onTheDate = rows
      .filter((row) => row.expires === "11 October")
      .flatMap((row) => row.plates);
    expect(onTheDate.length, "no row in the table expires 11 October").toBeGreaterThan(0);

    const claim = /([A-Za-z]+) of them now run to\s*\*\*11 October 2026\*\*/.exec(doc);
    expect(claim, `${DOC} no longer states how many run to 11 October`).not.toBeNull();
    expect(
      spelled(claim![1]),
      `§1a says "${claim![1]}" run to 11 October; its own table lists ${onTheDate.length} — ${onTheDate.join(", ")}`,
    ).toBe(onTheDate.length);
  });

  it("agrees with the prose on how many vehicles the broker listed", () => {
    const claim = /\*\*([A-Za-z]+) vehicles, and the fleet is ([a-z-]+)\.\*\*/.exec(doc);
    expect(claim, `${DOC} no longer states the broker's total against the fleet`).not.toBeNull();
    expect(
      spelled(claim![1]),
      `§1a says the broker listed "${claim![1]}" vehicles; its own table lists ${distinct.size}`,
    ).toBe(distinct.size);

    const fleet = spelled(claim![2]);
    const remainder = /The other ([a-z-]+) are not\b/.exec(doc);
    expect(remainder, `${DOC} no longer states how many vehicles are unaccounted for`).not.toBeNull();
    expect(
      spelled(remainder![1]),
      `§1a says "${remainder![1]}" vehicles are unaccounted for; ${fleet} − ${distinct.size} = ${fleet - distinct.size}`,
    ).toBe(fleet - distinct.size);
  });
});
