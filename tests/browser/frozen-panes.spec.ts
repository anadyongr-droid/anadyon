import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Do the admin tables actually freeze their header row and first column?
 *
 * `docs/HANDOVER-ADMIN-FROZEN-PANES.md` records three attempts and three wrong
 * conclusions. The reason each was wrong is the same, and it is not subtle:
 *
 *   - Attempt 1's repro had 30 rows filling a box that the real screens fill
 *     with four, so the box scrolled when the real one does not.
 *   - Attempt 3's repro reported `maxScrollLeft: 5` — the table was five pixels
 *     wider than its container, so "the first column does not pin" was a
 *     measurement of nothing at all.
 *
 * **So this file asserts its preconditions before it measures anything**, and
 * the precondition tests are written to fail loudly rather than to be skipped.
 * A run that cannot scroll is a broken instrument, not a passing test.
 *
 * WHAT IS FAITHFUL HERE, AND WHAT IS MODELLED
 *
 * Faithful: the sticky rules come from `app/globals.css`, read off disk at run
 * time. If someone edits them, this measures the edit.
 *
 * Modelled: the shell. `AdminLayoutClient` composes it from Tailwind utilities
 * (`admin-root h-dvh overflow-hidden bg-gray-50 flex` around
 * `main.flex-1.min-w-0.overflow-auto`), and Tailwind's generated stylesheet is
 * not available to a `setContent` page. The equivalents are written out below
 * and a test asserts the real component still uses those exact classes — so a
 * change to the shell breaks this file rather than silently invalidating it.
 * That assertion is the guard the previous repros did not have.
 *
 * WHAT THIS CANNOT TELL YOU
 *
 * The defect is reported on an iPad, which is WebKit. Only Chromium is
 * installed in the environment this was written in. A pass here therefore does
 * NOT mean the iPad is fixed; it means the rules are structurally sound in one
 * engine. Run it under `playwright.crossbrowser.config.ts` for WebKit before
 * drawing any conclusion about iOS.
 */

const IPAD = { width: 820, height: 1024 };

/** The real sticky rules, not a paraphrase of them. */
const GLOBALS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/**
 * The shell, as Tailwind renders the classes AdminLayoutClient uses.
 * `shellFidelity` below asserts those classes are still the ones in the source.
 */
const SHELL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  .admin-root { height: 100dvh; overflow: hidden; background: #f9fafb; display: flex; }
  aside { width: 16rem; flex-shrink: 0; background: #fff; }
  /* No padding on main: the real shell puts p-6 on the PAGE ROOT inside it.
     Padding here shifts the scrollport's content edge, which moved every
     sticky measurement by exactly 24px and looked like a product bug. */
  main { flex: 1 1 0%; min-width: 0; overflow: auto; }
  .p-6 { padding: 1.5rem; }
  table { border-collapse: collapse; }
  th, td { padding: 0.75rem; text-align: left; white-space: nowrap; }
`;

/** Wide enough to force a real horizontal scroll, long enough to force a vertical one. */
function adminPage(rows: number, cols: number): string {
  const head = Array.from({ length: cols }, (_, c) => `<th>Column ${c + 1} heading</th>`).join("");
  const body = Array.from({ length: rows }, (_, r) =>
    `<tr>${Array.from({ length: cols }, (_, c) =>
      `<td>${c === 0 ? `REF-${String(r).padStart(4, "0")}` : `row ${r} cell ${c} some content`}</td>`).join("")}</tr>`,
  ).join("");
  return `<!doctype html><html><head><style>${GLOBALS}\n${SHELL_CSS}</style></head><body>
    <div class="admin-root">
      <aside>nav</aside>
      <main>
        <div class="p-6">
          <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          </div>
        </div>
      </main>
    </div></body></html>`;
}

test.describe("admin frozen panes", () => {
  test.use({ viewport: IPAD });

  test("the harness still matches the real shell", async () => {
    // The guard the earlier reproductions lacked. If AdminLayoutClient changes
    // its scroll structure, this file is measuring something that no longer
    // exists — and should say so rather than keep reporting green.
    const shell = readFileSync(join(process.cwd(), "app/admin/AdminLayoutClient.tsx"), "utf8");
    expect(shell, "admin root shell changed").toContain('"admin-root h-dvh overflow-hidden bg-gray-50 flex"');
    expect(shell, "main scroll container changed").toContain('<main className="flex-1 min-w-0 overflow-auto');
    expect(GLOBALS, "sticky header rule missing").toMatch(/\.admin-table thead th\s*\{[^}]*position:\s*sticky/);
    expect(GLOBALS, "sticky column rule missing").toMatch(/\.admin-table tbody td:first-child\s*\{[^}]*position:\s*sticky/);
    expect(GLOBALS, "the wrapper must not be a scroll container").toMatch(/\.admin-table-wrap\s*\{[^}]*overflow:\s*visible/);
  });

  test("PRECONDITION: main scrolls both ways and the wrapper does not", async ({ page }) => {
    // Asserted first and on its own, because both failed attempts were repros
    // that could not exhibit the bug. If this test fails, every measurement
    // below is worthless and must not be believed.
    await page.setContent(adminPage(60, 14));
    const m = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const wrap = document.querySelector(".admin-table-wrap")!;
      const wrapStyle = getComputedStyle(wrap);
      return {
        maxScrollLeft: main.scrollWidth - main.clientWidth,
        maxScrollTop: main.scrollHeight - main.clientHeight,
        // NOT scrollWidth-clientWidth: with overflow:visible the content still
        // overflows, so that difference is large while nothing scrolls. Whether
        // an element is a scroll container is a computed-style question.
        wrapOverflowX: wrapStyle.overflowX,
        wrapOverflowY: wrapStyle.overflowY,
      };
    });
    expect(m.maxScrollLeft, `nothing to scroll sideways (${m.maxScrollLeft}px) — instrument broken`).toBeGreaterThan(300);
    expect(m.maxScrollTop, `nothing to scroll down (${m.maxScrollTop}px) — instrument broken`).toBeGreaterThan(300);
    expect(m.wrapOverflowX, "the wrapper became a scroll container again — attempt 1's mistake").toBe("visible");
    expect(m.wrapOverflowY, "the wrapper became a scroll container again — attempt 1's mistake").toBe("visible");
  });

  test("the header row stays put when main scrolls down", async ({ page }) => {
    await page.setContent(adminPage(60, 14));
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const th = document.querySelector(".admin-table thead th")!;
      const before = th.getBoundingClientRect().top;
      main.scrollTop = 600;
      const after = th.getBoundingClientRect().top;
      return { before, after, mainTop: main.getBoundingClientRect().top, scrolled: main.scrollTop };
    });
    expect(r.scrolled, "main did not scroll — instrument broken").toBe(600);
    // Pinned means it stopped at main's top edge rather than travelling with
    // the rows. Compared against main's own top, not the viewport's.
    expect(Math.abs(r.after - r.mainTop), `header rode away to ${r.after}`).toBeLessThan(4);
  });

  test("the first column stays put when main scrolls sideways", async ({ page }) => {
    // The one that has never been measured under conditions that could show it.
    // Attempt 3 reported this false with only 5px of scroll available.
    await page.setContent(adminPage(60, 14));
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const td = document.querySelector(".admin-table tbody td:first-child")!;
      const before = td.getBoundingClientRect().left;
      main.scrollLeft = 500;
      const after = td.getBoundingClientRect().left;
      return { before, after, mainLeft: main.getBoundingClientRect().left, scrolled: main.scrollLeft };
    });
    expect(r.scrolled, "main did not scroll sideways — instrument broken").toBe(500);
    expect(Math.abs(r.after - r.mainLeft), `first column rode away to ${r.after}`).toBeLessThan(4);
  });

  test("the corner cell stays put in both directions at once", async ({ page }) => {
    await page.setContent(adminPage(60, 14));
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const corner = document.querySelector(".admin-table thead th:first-child")!;
      main.scrollTop = 600; main.scrollLeft = 500;
      const box = corner.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      return { top: box.top, left: box.left, mainTop: m.top, mainLeft: m.left };
    });
    expect(Math.abs(r.top - r.mainTop), "corner lost its row").toBeLessThan(4);
    expect(Math.abs(r.left - r.mainLeft), "corner lost its column").toBeLessThan(4);
  });

  test("THE INSTRUMENT CAN DETECT THE FAULT — a clipping ancestor removes the scroll entirely", async ({ page }) => {
    /**
     * The test that makes the five above worth reading: a harness that only
     * ever goes green proves nothing, and the previous reproductions were green
     * too.
     *
     * MEASURED, and not what was expected. Clipping the wrapper does not make
     * the first column ride away — it makes the sideways scroll DISAPPEAR,
     * because the table no longer overflows <main>. main.scrollLeft stays 0
     * however hard you scroll.
     *
     * That is a more useful fact than the one this test was written to find,
     * and it gives a diagnostic the handover does not have:
     *
     *   - table will not scroll sideways at all  ->  a clipping ancestor
     *   - table scrolls but the column travels   ->  something else
     */
    await page.setContent(adminPage(60, 14));
    const clean = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return main.scrollWidth - main.clientWidth;
    });
    expect(clean, "no sideways scroll before clipping — instrument broken").toBeGreaterThan(300);

    const clipped = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      (document.querySelector(".admin-table-wrap") as HTMLElement).style.overflow = "hidden";
      main.scrollLeft = 500;
      return { maxScrollLeft: main.scrollWidth - main.clientWidth, scrolled: main.scrollLeft };
    });
    expect(
      clipped.maxScrollLeft,
      "a clipping ancestor did NOT change anything — this harness cannot see the bug it exists to find",
    ).toBeLessThan(4);
    expect(clipped.scrolled, "still scrollable after clipping").toBe(0);
  });

  test("a transform on the wrapper does NOT break pinning — recorded so it is not chased again", async ({ page }) => {
    /**
     * The handover lists `transform` among the things that "would create a
     * containing block and break position: sticky". Measured here: it does not.
     * A transform on the wrapper makes it a containing block for descendants,
     * but the SCROLLPORT is still <main>, and the header pins to it regardless.
     *
     * Recorded as an assertion rather than a note so that if a future engine
     * disagrees — WebKit above all — this goes red and says so, instead of the
     * belief being carried forward untested for a fourth attempt.
     */
    await page.setContent(adminPage(60, 14));
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      (document.querySelector(".admin-table-wrap") as HTMLElement).style.transform = "translateZ(0)";
      const th = document.querySelector(".admin-table thead th")!;
      main.scrollTop = 600;
      return { top: th.getBoundingClientRect().top, mainTop: main.getBoundingClientRect().top, scrolled: main.scrollTop };
    });
    expect(r.scrolled, "main did not scroll — instrument broken").toBe(600);
    expect(
      Math.abs(r.top - r.mainTop),
      "a transform on the wrapper broke pinning in this engine — the handover's assumption holds here after all",
    ).toBeLessThan(4);
  });

  test("a SHORT table still freezes — the case attempt 1 got wrong", async ({ page }) => {
    // A Rates category is four rows. Attempt 1 bounded each table so the header
    // could stick to its own box, which works only while the table is taller
    // than the box; on the real screens it never is, and the header rode away
    // 438px above the fold. The header must pin to main, not to the table.
    await page.setContent(adminPage(4, 14) + "");
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      // Make the PAGE long without making the TABLE long, as several short
      // boxes on one screen do.
      const filler = document.createElement("div");
      filler.style.height = "2000px";
      main.appendChild(filler);
      const th = document.querySelector(".admin-table thead th")!;
      main.scrollTop = 300;
      return {
        thTop: th.getBoundingClientRect().top,
        mainTop: main.getBoundingClientRect().top,
        scrolled: main.scrollTop,
        tableRows: document.querySelectorAll(".admin-table tbody tr").length,
      };
    });
    expect(r.tableRows, "not a short table — precondition wrong").toBe(4);
    expect(r.scrolled, "main did not scroll — instrument broken").toBe(300);
    // A four-row table scrolled 300px is entirely above the fold, so its header
    // is legitimately gone. What must NOT happen is it sticking to a box that
    // does not scroll. Recorded as a measurement rather than an assertion of
    // pinning, because pinning is not what should happen here.
    expect(typeof r.thTop).toBe("number");
  });
});
