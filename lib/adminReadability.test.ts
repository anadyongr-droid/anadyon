import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Admin text was too light to read, and the tables lost their headings as soon
 * as they scrolled.
 *
 * Measured against white, Tailwind's greys give:
 *
 *   text-gray-300   1.47:1   fails AA badly
 *   text-gray-400   2.54:1   fails AA — and it was used 118 times, on plate
 *                            numbers, references, margins and empty states
 *   text-gray-500   4.83:1   passes
 *   text-gray-600   7.56:1   comfortable
 *
 * The dark: variants are deliberately excluded everywhere below — a light grey
 * on a dark surface is correct, and darkening those would break the other theme.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const adminFiles: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".tsx")) adminFiles.push(p);
  }
})("app/admin");

/** Relative luminance, then WCAG contrast, so the thresholds are computed not asserted. */
function contrast(hex: string, against = "#ffffff"): number {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [a, b] = [lum(hex), lum(against)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("the greys we rely on clear WCAG AA", () => {
  it("gray-600 is comfortably readable on white", () => {
    expect(contrast("#4b5563")).toBeGreaterThanOrEqual(4.5);
  });

  it("gray-400 would not have been — which is why it was replaced", () => {
    expect(contrast("#9ca3af")).toBeLessThan(4.5);
  });
});

describe("no unreadable text survives in the admin", () => {
  it.each([
    ["text-gray-400", 2.54],
    ["text-gray-300", 1.47],
  ])("%s (%s:1) appears only as a dark: variant", (cls) => {
    const offenders: string[] = [];
    for (const f of adminFiles) {
      read(f).split("\n").forEach((ln, i) => {
        // Strip the dark: variants first, then look for what remains.
        if (ln.replace(new RegExp(`dark:${cls}`, "g"), "").includes(cls)) {
          offenders.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(offenders, `light-mode use of ${cls}:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the dark: variants were left alone", () => {
    const dark = adminFiles.reduce(
      (n, f) => n + (read(f).match(/dark:text-gray-[34]00/g) ?? []).length, 0);
    expect(dark, "darkening these would break the dark theme").toBeGreaterThan(0);
  });
});

describe("tables keep their bearings while scrolling", () => {
  const css = read("app/globals.css");

  it("the header row freezes", () => {
    expect(css).toMatch(/\.admin-table thead th\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.admin-table thead th\s*\{[^}]*top:\s*0/);
  });

  it("the first column freezes, so the row stays identifiable", () => {
    expect(css).toMatch(/\.admin-table tbody td:first-child\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.admin-table tbody td:first-child\s*\{[^}]*left:\s*0/);
  });

  it("every sticky cell paints a background", () => {
    // A transparent sticky cell lets the scrolling rows show through it.
    const blocks = css.match(/\.admin-table[^{]*\{[^}]*position:\s*sticky[^}]*\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b, b).toMatch(/background:/);
  });

  it("the wrapper scrolls in both axes and is height-bounded", () => {
    // Sticky resolves against the nearest scrolling ancestor: a wrapper that
    // only scrolls horizontally gives the header nothing to stick to.
    expect(css).toMatch(/\.admin-table-wrap\s*\{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/\.admin-table-wrap\s*\{[^}]*max-height:/);
  });

  it("the frozen column is dropped on a phone, where it would not fit", () => {
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]{0,260}position:\s*static/);
  });

  it("alert rows keep their colour on the frozen column", () => {
    // The frozen cell paints its own background, so row highlighting has to be
    // repeated there or the first column stays white on a red row.
    expect(css).toContain(".admin-table tbody tr.bg-red-50 td:first-child");
  });

  it("every admin table opts in", () => {
    let tables = 0, classed = 0;
    for (const f of adminFiles) {
      const src = read(f);
      tables += (src.match(/<table/g) ?? []).length;
      classed += (src.match(/<table className="admin-table/g) ?? []).length;
    }
    expect(tables).toBeGreaterThan(10);
    expect(classed).toBe(tables);
  });
});
