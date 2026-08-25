import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The admin was built desktop-only, and on an iPad it could not be used at all.
 *
 * Four separate causes, reported as four symptoms:
 *
 *   "screens are not dynamically adjusted"   a 208px rail with `shrink-0` that
 *                                            never collapsed, and no mobile nav
 *   "can't see the right end of the screens" table wrappers used
 *   "the content is not scrollable"          `overflow-hidden`, so anything wider
 *                                            than the container was CLIPPED
 *                                            rather than scrollable — one bug
 *                                            producing both symptoms
 *   "the reservation pop up goes outside     modal bodies were a fixed
 *    the screen limits"                      `grid-cols-2` that cannot narrow
 *
 * These assertions are structural because admin screens sit behind auth and
 * cannot be driven in the browser suite.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");
const layout = read("app/admin/AdminLayoutClient.tsx");

describe("the admin shell adapts to a tablet", () => {
  it("the nav rail is a drawer below lg and static from lg up", () => {
    expect(layout).toMatch(/fixed inset-y-0 left-0/);
    expect(layout).toMatch(/lg:static lg:translate-x-0/);
    // It must actually translate out of view when closed.
    expect(layout).toContain('"-translate-x-full"');
  });

  it("there is a way to open it, and two ways to close it", () => {
    expect(layout, "menu button").toContain('aria-label="Open navigation"');
    expect(layout, "close button").toContain('aria-label="Close navigation"');
    expect(layout, "tap-scrim").toMatch(/onClick=\{\(\) => setNavOpen\(false\)\}/);
    expect(layout, "escape key").toMatch(/e\.key === "Escape"/);
  });

  it("main can shrink, so a wide table scrolls instead of moving the page", () => {
    // Without min-w-0 a flex child refuses to go below its content's intrinsic
    // width — the single most common cause of a sideways-scrolling page.
    expect(layout).toMatch(/<main className="flex-1 min-w-0/);
  });

  it("content clears the fixed mobile bar", () => {
    expect(layout).toMatch(/pt-14 lg:pt-0/);
  });

  it("the menu button meets the 44px touch minimum", () => {
    // w-11 h-11 is 44px in Tailwind's default scale.
    expect(layout).toMatch(/w-11 h-11[^"]*"[\s\S]{0,120}aria-label="Open navigation"|aria-label="Open navigation"[\s\S]{0,200}w-11 h-11/);
  });
});

describe("data tables scroll rather than clip", () => {
  // Walk every admin page rather than a hand-picked list, so a new screen
  // added later with the old pattern is caught too.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) files.push(p);
    }
  };
  walk("app/admin");

  it("no table sits inside an overflow-hidden container", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = read(f).split("\n");
      lines.forEach((ln, i) => {
        if (!ln.includes("overflow-hidden")) return;
        const window = lines.slice(i + 1, i + 9).join("\n");
        if (!window.includes("<table")) return;
        // A clipping card is fine when the table has its own scroll container
        // inside it — that is the normal pattern for a card with a header
        // above the table, and the rounded corners still need the clip.
        const between = window.slice(0, window.indexOf("<table"));
        if (/admin-table-wrap|overflow-auto|overflow-x-auto/.test(between)) return;
        offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders, `these clip their table instead of scrolling it:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("covers every admin screen, not a sample", () => {
    expect(files.length).toBeGreaterThan(20);
  });
});

describe("modal fields stack on a narrow screen", () => {
  const modals = ["ReservationModal", "CustomerModal", "VehicleModal"];

  it.each(modals)("%s has no unbreakable two-column grid", (name) => {
    const src = read(`app/admin/components/${name}.tsx`);
    // `grid grid-cols-2` with no breakpoint cannot narrow, so the modal's
    // content stays wider than the viewport however small the screen gets.
    expect(src).not.toMatch(/grid grid-cols-2\b/);
  });

  it.each(modals)("%s is height-capped and scrolls its own body", (name) => {
    const src = read(`app/admin/components/${name}.tsx`);
    expect(src).toContain("max-h-[calc(100vh-2rem)]");
    expect(src).toMatch(/overflow-y-auto/);
  });
});
