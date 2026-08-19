import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Catches the CSS shape that overflows a narrow screen.
 *
 * A flex item defaults to `min-width: auto`, and for a form control that floor
 * is its intrinsic size — an input is roughly twenty characters wide before it
 * refuses to shrink further. Give one `flex-1` without `min-w-0` and it will
 * not fit; whatever sits beside it gets pushed past the edge instead.
 *
 * The promo code row did exactly this. Measured on production in Greek at a
 * 366px viewport, the input rendered 196px wide inside a 180px row and put the
 * Apply button's right edge precisely on the viewport boundary — fine on a
 * slightly wider phone, off screen on a narrower one, which is why it looked
 * broken one day and fine the next.
 *
 * This reads source rather than rendering, deliberately. The rendered check
 * could not have caught it: that sweep injected server HTML, and the booking
 * form does not exist in server HTML — it mounts only after the customer
 * clicks Get Quote. A scan that cannot see a surface reports it clean, which
 * is worse than not scanning it at all.
 */

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = tsxFiles("app");

describe("responsive layout hazards", () => {
  it("never gives a form control flex-1 without min-w-0", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const pattern = /<(input|select|textarea)\b[\s\S]{0,400}?className=\{?["`]([^"`]*)["`]/g;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(src))) {
        const cls = m[2];
        if (/\bflex-1\b/.test(cls) && !/\bmin-w-0\b/.test(cls)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${file}:${line} <${m[1]}> ${cls.slice(0, 50)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the promo row stacked on small screens", () => {
    // The row that actually overflowed. Asserted by name so a future
    // simplification back to a single unbroken row fails here rather than on
    // someone's phone.
    const src = readFileSync("app/components/BookingForm.tsx", "utf8");
    const row = src.match(/<div className="flex flex-col gap-2 sm:flex-row">[\s\S]{0,3000}?<\/div>/);
    expect(row, "promo row is no longer flex-col on mobile").not.toBeNull();
    expect(row![0]).toContain("min-w-0");
    expect(row![0]).toContain("shrink-0");
  });

  it("does not pad the booking form to 32px a side on a small phone", () => {
    // 64px of a 320px screen spent on padding leaves little for the controls
    // that then have to fit side by side.
    const src = readFileSync("app/components/BookingForm.tsx", "utf8");
    expect(src).not.toMatch(/className="p-8 space-y-6"/);
    expect(src).toMatch(/p-4 sm:p-8/);
  });
});
