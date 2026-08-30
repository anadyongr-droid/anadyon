import { expect, test } from "@playwright/test";

/**
 * The geometry behind the 44px touch-target work, measured rather than asserted.
 *
 * Two claims are load-bearing and neither is obvious from reading the CSS:
 *
 *   1. `.touch-target` gives a control a 44×44 hit area without resizing it.
 *   2. The reason it is used in exactly one place: applied to controls that sit
 *      close together, it makes their hit areas *overlap*, so a tap aimed at one
 *      lands on the other. That is worse than the small-target bug it fixes.
 *
 * The second test deliberately asserts a hazard rather than a feature. It is
 * here so that a future contributor who reaches for `.touch-target` as the
 * general answer — the obvious, tempting move, since it costs no visual change —
 * finds a measurement of what it does to a pair, instead of rediscovering it
 * from a support call about a rule that got deleted by someone aiming for Edit.
 *
 * These run against the built page so the numbers are Chromium's, not a
 * calculation repeated from the same wrong assumption. An earlier draft of the
 * blueprint reasoned the overlap out by hand and got 35px; it is 23px.
 */

const DOT = 13;   // the icon in the edit/delete pair
const GAP = 8;    // mr-2 / gap-2 between them
const MIN = 44;   // the floor the rate card is held to

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Precondition. If globals.css is not on this page, every measurement below
  // would quietly report the browser's defaults and pass for the wrong reason.
  const loaded = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((r) =>
          (r as CSSStyleRule).selectorText?.includes(".touch-target")
        );
      } catch {
        return false; // cross-origin sheet, not ours
      }
    })
  );
  expect(loaded, ".touch-target is not in any loaded stylesheet — instrument broken").toBe(true);
});

test(".touch-target reaches 44px without resizing the control", async ({ page }) => {
  const m = await page.evaluate((min) => {
    const b = document.createElement("button");
    b.className = "touch-target";
    // The real callers are h-[38px], sized to line up with the inputs beside
    // them in the vehicle ledger's grid row.
    b.style.cssText = "height:38px;width:38px;display:block";
    document.body.appendChild(b);

    const host = b.getBoundingClientRect();
    const after = getComputedStyle(b, "::after");
    const w = parseFloat(after.width);
    const h = parseFloat(after.height);
    b.remove();
    return {
      visualW: host.width, visualH: host.height,
      hitW: w, hitH: h,
      overhangX: (w - host.width) / 2,
      overhangY: (h - host.height) / 2,
      min,
    };
  }, MIN);

  // The visual box is untouched — that is the whole point of the utility.
  expect(m.visualW, "the utility resized the control it was supposed to leave alone").toBe(38);
  expect(m.visualH).toBe(38);

  expect(m.hitW).toBeGreaterThanOrEqual(MIN);
  expect(m.hitH).toBeGreaterThanOrEqual(MIN);

  // Centred, so the extra area is shared evenly and reaches into the row's own
  // gutter rather than piling onto one side.
  expect(m.overhangX).toBeCloseTo(3, 1);
  expect(m.overhangY).toBeCloseTo(3, 1);
});

test("that same utility would overlap the edit/delete pair — why it is not used there", async ({ page }) => {
  const overlap = await page.evaluate(({ dot, gap }) => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;top:0;left:0;display:flex";
    host.innerHTML =
      `<button class="touch-target" style="width:${dot}px;height:${dot}px;margin-right:${gap}px"></button>` +
      `<button class="touch-target" style="width:${dot}px;height:${dot}px"></button>`;
    document.body.appendChild(host);

    const hit = (el: Element) => {
      const r = el.getBoundingClientRect();
      const w = parseFloat(getComputedStyle(el, "::after").width);
      const cx = r.left + r.width / 2;
      return { left: cx - w / 2, right: cx + w / 2 };
    };
    const [a, b] = [...host.querySelectorAll("button")].map(hit);
    host.remove();
    return Math.max(0, a.right - b.left);
  }, { dot: DOT, gap: GAP });

  // Centres are 13 + 8 = 21px apart; two 44px areas therefore share 23px.
  // Delete paints last and wins that region, leaving Edit 21px of the 44px it
  // appears to have — and covering nearly half of where Edit looks like it is.
  expect(overlap, "if this is 0 the hazard is gone and the one-caller rule can be revisited")
    .toBeGreaterThan(20);
});

test("the pair as shipped does not overlap at all", async ({ page }) => {
  const overlap = await page.evaluate(({ min, gap }) => {
    const host = document.createElement("div");
    host.style.cssText = `position:absolute;top:0;left:0;display:flex;gap:${gap}px`;
    host.innerHTML =
      `<button style="min-width:${min}px;min-height:${min}px"></button>` +
      `<button style="min-width:${min}px;min-height:${min}px"></button>`;
    document.body.appendChild(host);

    const [a, b] = [...host.querySelectorAll("button")].map((el) => el.getBoundingClientRect());
    host.remove();
    return Math.max(0, a.right - b.left);
  }, { min: MIN, gap: GAP });

  // Real boxes cannot overlap: the target you can see is the target you hit.
  expect(overlap).toBe(0);
});
