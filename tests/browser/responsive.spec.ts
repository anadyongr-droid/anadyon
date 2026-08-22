import { test, expect, type Page } from "@playwright/test";

/**
 * Nothing may overflow the viewport, at any width, in either language, with the
 * booking form open.
 *
 * The widths are the real ones: 320 is the narrowest phone still in use, 360
 * and 375 cover most Android and older iPhones, 390 and 430 the current ones,
 * and 768 the tablet breakpoint where the layout switches from stacked to
 * side by side. The promo button overflowed at 366 and sat exactly on the
 * boundary at 375 — which is why a single representative width found nothing.
 *
 * Greek is checked as well as English because it is the longer language.
 * "Εφαρμογή" is twice the width of "Apply", and label length is what turns a
 * layout that just fits into one that does not.
 */

const WIDTHS = [320, 360, 375, 390, 430, 768];
const PAGES = [
  { path: "/cars", quote: "Get Quote", locale: "en" },
  { path: "/el/cars", quote: "Προσφορά", locale: "el" },
];

/** Opens the booking form the way a customer does. */
async function openBookingForm(page: Page, quoteLabel: string) {
  const button = page.getByRole("button", { name: new RegExp(quoteLabel, "i") })
    .or(page.getByRole("link", { name: new RegExp(quoteLabel, "i") }))
    .first();
  await button.click();

  // Anchored on the form's own container and its first select, not on the
  // price panel and not on a <form> element. Step one of the booking flow is a
  // plain div — <form> only wraps step two — and the dates use a custom picker
  // rather than input[type=date].
  //
  // Prices are deliberately not the anchor. CI builds against placeholder
  // Supabase credentials and never reaches a database, so there is no rate
  // card and no € to wait for; anchoring on one would fail every layout test
  // for a reason that has nothing to do with layout. The form still renders,
  // which is all these tests need.
  await page.locator("#booking-form").waitFor({ state: "visible" });
  await page.locator("#booking-form select").first().waitFor({ state: "visible" });
}

/**
 * True when the page was served with the rate card embedded.
 *
 * Asks the precondition directly rather than looking for a euro sign on the
 * page: € appears in the extras table and elsewhere regardless of whether the
 * rate card loaded, so that heuristic reported prices present on a build that
 * had no database at all.
 *
 * CI builds against placeholder Supabase credentials, so there is no card and
 * the price panel never renders. Tests that depend on it skip rather than fail
 * — a build with no data cannot answer a question about pricing behaviour.
 */
async function rateCardWasServed(page: Page, path: string): Promise<boolean> {
  const html = await (await page.request.get(path)).text();
  return html.includes("rate_1_2");
}

/**
 * Every element that renders must sit inside the viewport.
 *
 * Measured per element rather than by document.scrollWidth: an overflowing
 * child inside a container that clips it leaves scrollWidth unchanged, so the
 * page looks fine while a button sits out of reach beyond the edge. That is
 * exactly how the promo row behaved.
 */
async function findOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const offenders: string[] = [];
    /**
     * Content inside a horizontally scrollable box is reachable — the reader
     * scrolls that box. A wide table deliberately given overflow-x:auto is a
     * design decision, not a defect. What this test is for is content pushed
     * past the edge with no way to get to it.
     */
    const inScrollableBox = (el: Element): boolean => {
      let n: Element | null = el.parentElement;
      while (n && n !== document.body) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
        n = n.parentElement;
      }
      return false;
    };

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (inScrollableBox(el)) continue;
      // A couple of pixels of rounding is not a defect.
      if (r.right > vw + 2 || r.left < -2) {
        const tag = el.tagName.toLowerCase();
        const cls = (typeof el.className === "string" ? el.className : "").slice(0, 44);
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
        offenders.push(`<${tag} class="${cls}"> "${text}" right=${Math.round(r.right)} vw=${vw}`);
      }
    }
    // Report the outermost offenders; a parent that overflows drags its
    // children with it and listing all of them buries the cause.
    return offenders.slice(0, 6);
  });
}

for (const { path, quote, locale } of PAGES) {
  for (const width of WIDTHS) {
    test(`${locale} ${path} has nothing outside the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await openBookingForm(page, quote);

      const offenders = await findOverflow(page);
      expect(offenders, `elements past the right edge at ${width}px`).toEqual([]);
    });
  }
}

test("the promo row stacks rather than overflowing on a narrow phone", async ({ page }) => {
  // The specific regression, asserted directly. At 366px in Greek the input
  // rendered 196px inside a 180px row and put the Apply button's right edge on
  // the viewport boundary.
  test.skip(!(await rateCardWasServed(page, "/el/cars")),
    "no rate card in this build — the promo row lives inside the price panel");

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/el/cars");
  await openBookingForm(page, "Προσφορά");

  const promo = page.locator('input[placeholder*="ροσφορ" i]').first();
  await promo.waitFor({ state: "visible" });

  const box = await promo.boundingBox();
  const row = await promo.evaluate((el) => {
    const parent = el.parentElement!;
    const r = parent.getBoundingClientRect();
    const button = parent.querySelector("button");
    const b = button?.getBoundingClientRect();
    return {
      rowRight: r.right,
      rowWidth: r.width,
      inputWidth: el.getBoundingClientRect().width,
      buttonRight: b?.right ?? 0,
      stacked: b ? b.top >= el.getBoundingClientRect().bottom - 5 : false,
    };
  });

  expect(box).not.toBeNull();
  // The input must fit the row it is in — this is what min-w-0 buys.
  expect(row.inputWidth).toBeLessThanOrEqual(row.rowWidth + 1);
  // And the button must not be pushed past it.
  expect(row.buttonRight).toBeLessThanOrEqual(row.rowRight + 1);
  expect(row.stacked, "controls should stack below the sm breakpoint").toBe(true);
});

test("the price panel is present without waiting for a rate request", async ({ page }) => {
  // The rate card is served with the page. If that regresses, the form falls
  // back to fetching and the skeleton returns on every open.
  const rateRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/admin/rates")) rateRequests.push(r.url());
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/cars");
  await openBookingForm(page, "Get Quote");

  // Skipped rather than failed when the build had no database to read from:
  // without a card the form correctly falls back to fetching, so asserting
  // that it did not fetch would be asserting the opposite of correct
  // behaviour.
  test.skip(!(await rateCardWasServed(page, "/cars")),
    "no rate card in this build — nothing to assert about seeding");

  await expect(page.locator("text=/€/").first()).toBeVisible();
  expect(rateRequests, "the form should not need to fetch rates").toEqual([]);
});

for (const sample of [
  { locale: "en", path: "/cars", quote: "Get Quote", next: /continue/i, dob: /Date of Birth/, flight: "Flight number" },
  { locale: "el", path: "/el/cars", quote: "Προσφορά", next: /συνέχεια/i, dob: /Ημερομηνία Γέννησης/, flight: "Αριθμός πτήσης" },
]) {
  test(`${sample.locale} native DOB picker and flight number share one row at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(sample.path);
    await openBookingForm(page, sample.quote);
    await page.getByRole("button", { name: sample.next }).click();

    const dob = page.getByLabel(sample.dob);
    const flight = page.getByLabel(sample.flight);
    await expect(dob).toBeVisible();
    await expect(flight).toBeVisible();
    await expect(dob).toHaveAttribute("type", "date");

    await dob.fill("2000-05-07");
    await expect(dob).toHaveValue("2000-05-07");

    const dobBox = await dob.boundingBox();
    const flightBox = await flight.boundingBox();
    expect(dobBox).not.toBeNull();
    expect(flightBox).not.toBeNull();
    expect(Math.abs(dobBox!.y - flightBox!.y), "DOB and flight controls must share a row").toBeLessThan(2);

    expect(await findOverflow(page), "details fields must remain inside 320px").toEqual([]);
  });
}
