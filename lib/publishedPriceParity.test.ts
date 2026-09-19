import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Prices quoted in `docs/` must match the extras the repository actually seeds.
 *
 * On 19 September 2026 five documents stated the Full Damage Waiver sells at
 * **€12/day**. It sells at **€5.00**. The 12 came from
 * `supabase/seeds/staging.sql`, whose first line reads "Synthetic staging
 * fixtures only" — a test fixture read as a price list, then repeated until it
 * looked like a fact. It reached the README status section, the insurance
 * analysis, the competitor benchmark and open item B5, where it overstated the
 * self-insured exposure by a factor of 2.4 in the direction that makes the
 * product look safer than it is.
 *
 * Nothing caught it because nothing was looking. A number in prose is invisible
 * to a typechecker and to every test in this suite, so it survived four
 * documents and two review passes on its own plausibility.
 *
 * This asserts internal consistency, and only that. It compares documentation
 * against `supabase/schema.sql`, which is the repository's declared seed — not
 * against the live `extras_config` row, which staff may edit from Admin → Rates
 * and which no test here can reach. If an operator changes a price, this test
 * keeps passing while both the docs and the seed go stale together. It prevents
 * the specific failure that happened: a fixture leaking into prose.
 *
 * A paragraph that legitimately carries a figure we do not charge — a
 * competitor's price, a quotation from a contract, or a dated log entry
 * preserving what was believed at the time — marks itself
 * `<!-- price-exempt: why -->`. The reason is required and must be more than a
 * word, which is deliberately a nuisance: an exemption with no argument is how
 * this failure gets re-enabled rather than fixed.
 *
 * Dated worklog entries are exempted rather than edited. `DEFINING-STATEMENTS.md`
 * §11 makes them a record of what an agent did and believed on a day; quietly
 * changing the figure would make the record say something truer than what
 * happened, which is the wrong repair for a document whose value is that it is
 * contemporaneous. They strike the figure through and name the correction.
 */
const CANON = "supabase/schema.sql";
const DOCS = "docs";
const OPT_OUT = /<!--\s*price-exempt:\s*([^>]{8,}?)\s*-->/;

/** The extras seed, read from the SQL rather than restated here. */
function canonicalRates(): Map<string, { label: string; rate: number }> {
  const sql = readFileSync(CANON, "utf8");
  const block = /insert into extras_config[\s\S]*?;/i.exec(sql);
  if (!block) throw new Error(`no extras_config seed found in ${CANON}`);

  const rates = new Map<string, { label: string; rate: number }>();
  for (const m of block[0].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([^']+)'\s*,\s*([\d.]+)/g)) {
    rates.set(m[1], { label: m[2], rate: Number(m[3]) });
  }
  return rates;
}

/** What a reader might call each extra. Lowercased; longest first so "full damage waiver" wins over "damage waiver". */
const ALIASES: Record<string, string[]> = {
  fdw: ["full damage waiver", "damage waiver", "fdw"],
  gps: ["gps navigation", "gps"],
  baby_seat: ["baby seat"],
  child_seat: ["child seat"],
  additional_drivers: ["additional driver"],
};

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Paragraphs, not lines.
 *
 * These documents are hard-wrapped, so "the Full\nDamage Waiver we sell at
 * €12/day" straddles a line break and a per-line scan would miss it — which is
 * how one of the five got written in the first place. Joined per paragraph,
 * keeping the starting line number so a failure names somewhere findable.
 */
function paragraphs(text: string): { line: number; text: string }[] {
  const lines = text.split("\n");
  const out: { line: number; text: string }[] = [];
  let buf: string[] = [];
  let start = 1;

  const flush = () => {
    if (buf.length) out.push({ line: start, text: buf.join(" ") });
    buf = [];
  };

  lines.forEach((l, i) => {
    if (l.trim() === "") { flush(); start = i + 2; return; }
    if (!buf.length) start = i + 1;
    buf.push(l);
  });
  flush();
  return out;
}

const rates = canonicalRates();

describe("prices quoted in docs match the seeded extras", () => {
  it("finds the extras seed to compare against", () => {
    expect(rates.size).toBeGreaterThanOrEqual(5);
    expect(rates.get("fdw")?.rate).toBeGreaterThan(0);
  });

  it("no document states one of our extras at a price we do not charge", () => {
    const wrong: string[] = [];

    for (const file of markdownFiles(DOCS)) {
      for (const { line, text } of paragraphs(readFileSync(file, "utf8"))) {
        if (OPT_OUT.test(text)) continue;
        const hay = text.toLowerCase();

        for (const [key, aliases] of Object.entries(ALIASES)) {
          const canon = rates.get(key);
          if (!canon) continue;

          const alias = aliases.find((a) => hay.includes(a));
          if (!alias) continue;

          // Every euro figure in the same paragraph as the extra's name.
          for (const m of hay.matchAll(/€\s?(\d+(?:[.,]\d+)?)\s*(?:\/|\s+per\s+|\s+a\s+)?\s*day/g)) {
            const quoted = Number(m[1].replace(",", "."));
            if (quoted !== canon.rate) {
              wrong.push(
                `${file}:${line} — "${alias}" quoted at €${quoted}/day, seeded at €${canon.rate.toFixed(2)}`,
              );
            }
          }
        }
      }
    }

    expect(
      [...new Set(wrong)],
      `Documentation quotes a price the repository does not seed.\n` +
        `Either the document is wrong, or ${CANON} is — check the live extras_config row before deciding.\n` +
        `If the figure is deliberately not ours — a competitor, a contract quotation, a dated\n` +
        `log entry preserving what was believed then — mark the paragraph\n` +
        `<!-- price-exempt: the reason, in a phrase -->.\n`,
    ).toEqual([]);
  });
});
