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

  it("no element sets dark: text without a dark: surface to sit on", () => {
    // Tailwind v4's `dark:` follows prefers-color-scheme by default, so on a
    // dark-OS device these fire even though the admin has no dark theme. Where
    // a file lightens its text without also darkening its background, the text
    // simply goes faint on white — which is how the status legend on the
    // Reservations, Quotes and Calendar screens became unreadable on an iPad.
    const offenders: string[] = [];
    for (const f of adminFiles) {
      const src = read(f);
      const text = (src.match(/dark:text-/g) ?? []).length;
      const bg = (src.match(/dark:bg-/g) ?? []).length;
      if (text > 0 && bg === 0) offenders.push(`${f} (${text} dark:text, no dark:bg)`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
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
    // Strip comments first — otherwise prose that mentions `position: sticky`
    // is matched as though it were a rule.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = rules.match(/\.admin-table[^{]*\{[^}]*position:\s*sticky[^}]*\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b, b).toMatch(/background:/);
  });

  it("the wrapper is NOT a scroll container", () => {
    // This is the correction. Making each table its own bounded scroller only
    // works while the table is taller than the box. On the real screens most
    // boxes are short — a Rates category is four rows — so the box never
    // scrolled, the header had nothing to stick to, and it rode away with the
    // page: measured 438px above the fold on a six-box Rates page.
    //
    // With no overflow here, sticky resolves against <main>, which is what
    // actually scrolls.
    expect(css).toMatch(/\.admin-table-wrap\s*\{[^}]*overflow:\s*visible/);
    expect(css, "a bounded wrapper re-introduces the bug")
      .not.toMatch(/\.admin-table-wrap\s*\{[^}]*max-height:/);
  });

  it("wide tables keep their natural width so there is something to freeze against", () => {
    // w-full alone is width:100%, so a many-columned table compresses to fit
    // and the frozen first column has nothing to pin against.
    expect(css).toMatch(/\.admin-table\s*\{[^}]*min-width:\s*max-content/);
  });

  it("the frozen panes stay light, whatever the device theme is set to", () => {
    // The admin is a light-only UI. A prefers-color-scheme block here once
    // painted the frozen header and column dark on an iPad whose OS was in
    // dark mode, while every other cell stayed white — two unreadable panels.
    const darkBlocks = css.match(/@media \(prefers-color-scheme: dark\)\s*\{(?:[^{}]|\{[^}]*\})*\}/g) ?? [];
    for (const b of darkBlocks) {
      expect(b, "no admin-table rule may sit in a dark block").not.toContain("admin-table");
    }
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

describe("the admin renders light on a device set to dark", () => {
  const css = read("app/globals.css");
  const layout = read("app/admin/AdminLayoutClient.tsx");

  it("the shell carries the light scope", () => {
    // Both the main shell and the early return for login / MFA / set-password.
    expect((layout.match(/admin-root/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("form controls are pinned light, not left to inherit", () => {
    // body { color: var(--foreground) } flips to #ededed on a dark device.
    // All 88 admin inputs set no colour of their own, so they inherited it and
    // rendered near-white on white — 1.17:1.
    expect(css).toMatch(/\.admin-root input[\s\S]{0,80}color:\s*#171717/);
    expect(css).toMatch(/\.admin-root\s*\{[^}]*color-scheme:\s*light/);
  });

  it("placeholders stay lighter than values, but readable", () => {
    expect(css).toMatch(/\.admin-root ::placeholder[\s\S]{0,60}color:\s*#6b7280/);
  });

  it("disabled fields remain readable on iOS", () => {
    // iOS ignores `color` on a disabled input; -webkit-text-fill-color is what
    // it honours.
    expect(css).toMatch(/-webkit-text-fill-color/);
  });
});

describe("every table freezes, on every screen", () => {
  it("no admin table sits outside a bounded scroll container", () => {
    const loose: string[] = [];
    for (const f of adminFiles) {
      const src = read(f);
      for (const m of src.matchAll(/<table className="admin-table/g)) {
        const tail = src.slice(0, m.index).slice(-600);
        const bounded = tail.includes("admin-table-wrap") ||
          (tail.includes("overflow-auto") && tail.includes("maxHeight"));
        if (!bounded) loose.push(f);
      }
    }
    // Sticky resolves against the nearest scrolling ancestor. A table without
    // one keeps neither its header nor its first column.
    expect(loose, `these tables cannot freeze:\n${loose.join("\n")}`).toEqual([]);
  });
});

describe("the shared date picker stays light inside the admin", () => {
  const css = read("app/globals.css");
  const picker = read("app/components/DateRangePicker.tsx");

  it("every dark: utility the picker uses is neutralised for the admin", () => {
    // The component is shared with the public booking form, which has a real
    // dark theme — so the classes cannot be removed, only overridden in the
    // admin subtree. If the picker gains a new dark: utility, this fails.
    const used = [...new Set(picker.match(/dark:[a-z-]+-[a-z0-9-]+/g) ?? [])];
    expect(used.length).toBeGreaterThan(0);
    const missing = used.filter(u => !css.includes(`.admin-root .${u.replace(":", "\\:")}`));
    expect(missing, `not overridden for .admin-root:\n${missing.join("\n")}`).toEqual([]);
  });

  it("the overrides sit inside a dark media query, not unconditionally", () => {
    // Applying them always would be harmless but misleading; they exist only
    // to cancel a dark-device rendering.
    const dark = css.match(/@media \(prefers-color-scheme: dark\)\s*\{(?:[^{}]|\{[^}]*\})*\}/g) ?? [];
    expect(dark.some(b => b.includes(".admin-root .dark"))).toBe(true);
  });
});
