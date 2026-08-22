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

/** Wait until a deliberate smooth scroll has stopped before measuring layout. */
async function waitForScrollToSettle(page: Page) {
  // The booking form schedules its scroll 50 ms after switching steps.
  await page.waitForTimeout(100);
  await page.evaluate(() => new Promise<void>((resolve) => {
    let previousY = window.scrollY;
    let stableFrames = 0;

    const check = () => {
      const currentY = window.scrollY;
      stableFrames = Math.abs(currentY - previousY) < 0.5 ? stableFrames + 1 : 0;
      previousY = currentY;

      if (stableFrames >= 4) resolve();
      else requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }));
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
  { locale: "en", path: "/cars", quote: "Get Quote", next: /continue/i, dob: /Date of Birth/, flight: "Flight number", day: "Day", month: "Month", year: "Year", may: "May", done: "Done" },
  { locale: "el", path: "/el/cars", quote: "Προσφορά", next: /συνέχεια/i, dob: /Ημερομηνία Γέννησης/, flight: "Αριθμός πτήσης", day: "Ημέρα", month: "Μήνας", year: "Έτος", may: "Μάι", done: "Έτοιμο" },
]) {
  test(`${sample.locale} DOB wheel is fast and matches the flight field at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(sample.path);
    await openBookingForm(page, sample.quote);
    await page.getByRole("button", { name: sample.next }).click();
    // Step two intentionally scrolls the booking card back to its heading.
    // Measuring while that animation is running compares two different page
    // positions even though the controls occupy the same grid row.
    await waitForScrollToSettle(page);

    const dob = page.getByLabel(sample.dob);
    const flight = page.getByLabel(sample.flight);
    await expect(dob).toBeVisible();
    await expect(flight).toBeVisible();
    await expect(page.locator('#booking-form input[type="date"]')).toHaveCount(0);

    const initialDobBox = await dob.boundingBox();
    const initialFlightBox = await flight.boundingBox();
    expect(initialDobBox).not.toBeNull();
    expect(initialFlightBox).not.toBeNull();
    expect(Math.abs(initialDobBox!.width - initialFlightBox!.width), "fields must have equal widths").toBeLessThanOrEqual(1);
    expect(Math.abs(initialDobBox!.height - initialFlightBox!.height), "fields must have equal heights").toBeLessThanOrEqual(1);
    expect(Math.abs(initialDobBox!.y - initialFlightBox!.y), "fields must share a row").toBeLessThanOrEqual(2);

    await dob.click();
    const dialog = page.getByRole("dialog", { name: sample.dob });
    await expect(dialog).toBeVisible();

    // The default age band is 26–65, so the year wheel starts near its
    // midpoint rather than making an adult scroll back from the current year.
    const preferredYear = String(new Date().getFullYear() - 45);
    const yearWheel = dialog.getByRole("listbox", { name: sample.year });
    const selectedYear = yearWheel.getByRole("option", { name: preferredYear, exact: true });
    await expect(selectedYear).toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => {
      const wheelBox = await yearWheel.boundingBox();
      const optionBox = await selectedYear.boundingBox();
      if (!wheelBox || !optionBox) return Number.POSITIVE_INFINITY;
      return Math.abs((wheelBox.y + wheelBox.height / 2) - (optionBox.y + optionBox.height / 2));
    }, { message: "the suggested year must be centred immediately" }).toBeLessThanOrEqual(1);

    // Exercise the same scroll path a finger swipe uses, not only option taps.
    await yearWheel.evaluate((element) => element.scrollBy({ top: 5 * 44 }));
    await page.waitForTimeout(120);
    await expect(yearWheel.getByRole("option", { name: String(Number(preferredYear) - 5), exact: true }))
      .toHaveAttribute("aria-selected", "true");

    await dialog.getByRole("listbox", { name: sample.day }).getByRole("option", { name: "7", exact: true }).click();
    await dialog.getByRole("listbox", { name: sample.month }).getByRole("option", { name: sample.may, exact: true }).click();
    await dialog.getByRole("listbox", { name: sample.year }).getByRole("option", { name: "2000", exact: true }).click();
    await dialog.getByRole("button", { name: sample.done, exact: true }).click();

    await expect(dob).toHaveAttribute("data-date-value", "2000-05-07");
    await expect(dob).toHaveValue("07/05/2000");

    const dobBox = await dob.boundingBox();
    const flightBox = await flight.boundingBox();
    expect(dobBox).not.toBeNull();
    expect(flightBox).not.toBeNull();
    expect(Math.abs(dobBox!.width - flightBox!.width), "fields must stay equal after DOB selection").toBeLessThanOrEqual(1);
    expect(Math.abs(dobBox!.height - flightBox!.height), "fields must stay equal after DOB selection").toBeLessThanOrEqual(1);

    expect(await findOverflow(page), "details fields must remain inside 320px").toEqual([]);
  });
}
