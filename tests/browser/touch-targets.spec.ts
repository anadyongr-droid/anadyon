import { expect, test } from "@playwright/test";

/**
 * The geometry behind the 44px touch-target work, measured rather than asserted.
 *
 * These ask the browser `elementFromPoint(x, y)` — "if a thumb lands here, what
 * does it hit?" — rather than reading `getComputedStyle(el, "::after").width`.
 * Hit testing *is* the claim; a computed width is only a proxy for it, and the
 * proxy is the half that varies between engines. This suite runs in Chromium
 * and Firefox, so it is written to depend on behaviour both agree on.
 *
 * Two claims are load-bearing and neither is obvious from reading the CSS:
 *
 *   1. `.touch-target` gives a control a 44×44 hit area without resizing it.
 *   2. The reason it is used in exactly one place: applied to controls that sit
 *      close together, it makes their hit areas overlap so badly that a tap on
 *      one lands on the other. That is worse than the small-target bug it fixes.
 *
 * The second test deliberately asserts a hazard rather than a feature. It is
 * here so that a future contributor reaching for `.touch-target` as the general
 * answer — the tempting move, since it costs no visual change — finds a
 * measurement of what it does to a pair, instead of rediscovering it from a
 * support call about a rule deleted by someone aiming for Edit.
 */

const DOT = 13;   // the icon in the edit/delete pair
const GAP = 8;    // mr-2 / gap-2 between them
const MIN = 44;   // the floor the rate card is held to

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Precondition. If globals.css is not on this page every measurement below
  // would quietly report the browser's defaults and pass for the wrong reason.
  //
  // Verified by renaming the class and re-running — which at first still
  // passed, because playwright.config.ts reuses a running server and the
  // browser was being served the previous build's CSS. Its own comment warns
  // about that. Editing CSS and re-running proves nothing without a rebuild.
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

test(".touch-target extends the hit area past the control without resizing it", async ({ page }) => {
  const r = await page.evaluate(() => {
    const host = document.createElement("div");
    // Away from the page's own content so nothing else is under these points.
    host.style.cssText = "position:fixed;top:200px;left:200px;z-index:9999";
    host.innerHTML = `<button class="touch-target" style="width:38px;height:38px;display:block"></button>`;
    document.body.appendChild(host);
    const b = host.querySelector("button")!;
    const box = b.getBoundingClientRect();

    const hits = (dx: number, dy: number) =>
      document.elementFromPoint(box.left + box.width / 2 + dx, box.top + box.height / 2 + dy) === b;

    const out = {
      visualW: box.width,
      visualH: box.height,
      centre: hits(0, 0),
      // 38px box, 44px hit area ⇒ 3px of reach past each edge.
      twoAbove: hits(0, -(box.height / 2) - 2),
      twoLeft: hits(-(box.width / 2) - 2, 0),
      // …and no further than that. If this is true the area is bigger than 44.
      sixAbove: hits(0, -(box.height / 2) - 6),
    };
    host.remove();
    return out;
  });

  // The visual box is untouched — the whole point of the utility.
  expect(r.visualW, "the utility resized the control it was meant to leave alone").toBe(38);
  expect(r.visualH).toBe(38);

  expect(r.centre, "the button does not even receive its own centre").toBe(true);
  expect(r.twoAbove, "2px above a 38px control is not hitting it — no extension").toBe(true);
  expect(r.twoLeft).toBe(true);
  expect(r.sixAbove, "6px past the edge still hits — the area is larger than 44px").toBe(false);
});

test("that same utility hands the edit button's own centre to delete — why it is not used there", async ({ page }) => {
  const r = await page.evaluate(({ dot, gap }) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:200px;left:200px;z-index:9999;display:flex";
    host.innerHTML =
      `<button id="edit" class="touch-target" style="width:${dot}px;height:${dot}px;margin-right:${gap}px"></button>` +
      `<button id="del" class="touch-target" style="width:${dot}px;height:${dot}px"></button>`;
    document.body.appendChild(host);

    const edit = host.querySelector("#edit")!;
    const del = host.querySelector("#del")!;
    const e = edit.getBoundingClientRect();
    const at = (x: number, y: number) => document.elementFromPoint(x, y)?.id ?? "";

    // Dead centre of the *edit* icon — where a thumb aimed at Edit lands.
    const ownerOfEditCentre = at(e.left + e.width / 2, e.top + e.height / 2);
    host.remove();
    return { ownerOfEditCentre, del: del.id };
  }, { dot: DOT, gap: GAP });

  // Centres are 13 + 8 = 21px apart, so two 44px areas share 23px — and the
  // shared region swallows Edit's own centre. Delete is later in the DOM, so it
  // paints on top and wins every pixel they share. A tap on the middle of the
  // edit icon deletes the rule.
  expect(
    r.ownerOfEditCentre,
    "the hazard is gone — if this now returns 'edit', the one-caller rule on .touch-target can be revisited"
  ).toBe("del");
});

test("the pair as shipped gives each button its own centre", async ({ page }) => {
  const r = await page.evaluate(({ min, gap }) => {
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;top:200px;left:200px;z-index:9999;display:flex;gap:${gap}px`;
    host.innerHTML =
      `<button id="edit" style="min-width:${min}px;min-height:${min}px"></button>` +
      `<button id="del" style="min-width:${min}px;min-height:${min}px"></button>`;
    document.body.appendChild(host);

    const at = (el: Element) => {
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id ?? "";
    };
    const out = {
      edit: at(host.querySelector("#edit")!),
      del: at(host.querySelector("#del")!),
      width: host.querySelector("#edit")!.getBoundingClientRect().width,
    };
    host.remove();
    return out;
  }, { min: MIN, gap: GAP });

  // Real boxes cannot overlap: the target you can see is the target you hit.
  expect(r.width).toBeGreaterThanOrEqual(MIN);
  expect(r.edit).toBe("edit");
  expect(r.del).toBe("del");
});
