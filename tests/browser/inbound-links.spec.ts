import { expect, test } from "@playwright/test";

/**
 * Links written against this site by other people, and what happens when one is
 * wrong.
 *
 * Both halves of this suite exist because of one Google Analytics referral on
 * 19 September 2026. A French travel guide, notrevieenvoyage.com, links
 * `https://anadyon.gr/en/`; that URL 308s to `/en` and then 404ed, onto Next's
 * built-in blank page. So every reader it sent arrived, saw nothing, and left.
 *
 * Asserted against a served response rather than against the redirect table in
 * next.config, because the table is not the behaviour. `/en/:path*` matching a
 * bare `/en` and the trailing-slash normalisation running before or after the
 * redirect are both things that can only be settled by asking the server, and
 * both are exactly where this would break.
 *
 * Run against the unfixed build first, which is the only way to know a
 * regression test tests anything: five of the six failed — the three redirect
 * cases on a 404, the two recovery-page cases on finding no heading and nothing
 * to click.
 *
 * The sixth ("still answers 404 to crawlers") passed before the fix and passes
 * after, deliberately. Next's built-in 404 page already returned the right
 * status; that test is not evidence of this change, it is a guard against a
 * later one. The tempting way to make a 404 friendlier is to redirect it to the
 * home page or render it with a 200, and both turn every dead inbound link into
 * a soft 404 that no report will ever flag. It is here to fail on that day.
 */

/** The URL the French guide actually publishes, character for character. */
const REFERRED = "/en/";

test.describe("legacy /en links", () => {
  test("the exact URL a third party links resolves to the English home page", async ({ page }) => {
    const response = await page.goto(REFERRED, { waitUntil: "domcontentloaded" });

    expect(response?.status(), "the referred URL must not 404").toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");

    // Landing on *a* 200 is not the claim; landing on the English home page is.
    // A redirect to the Greek site or to a stub would satisfy the status check
    // and still waste the referral.
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("a bare /en resolves too", async ({ page }) => {
    const response = await page.goto("/en", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("/en subpaths keep their page", async ({ page }) => {
    const response = await page.goto("/en/cars", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/cars");
  });
});

test.describe("the page a wrong link lands on", () => {
  // Deliberately a URL nothing will ever route, so this keeps testing the
  // fallback even after pages are added.
  const GONE = "/this-page-does-not-exist-9f4c";

  test("still answers 404 to crawlers", async ({ page }) => {
    const response = await page.goto(GONE, { waitUntil: "domcontentloaded" });

    // The status is the half a visitor cannot see and the half search engines
    // act on. A recovery page served with a 200 is a soft 404: the URL gets
    // indexed and the dead link is never reported as dead.
    expect(response?.status(), "must not become a soft 404").toBe(404);
  });

  test("offers the visitor somewhere to go", async ({ page }) => {
    await page.goto(GONE, { waitUntil: "domcontentloaded" });

    // Precondition: prove we are on the recovery page and not on a page that
    // merely happens to have a nav bar. Without this the link assertions below
    // would pass on the old blank 404, which the root layout also wrapped in a
    // header and a footer.
    await expect(page.getByRole("heading", { name: /that page isn't here/i })).toBeVisible();

    for (const name of [/^Cars$/, /^Motorbikes$/, /^Bikes$/]) {
      await expect(page.getByRole("main").getByRole("link", { name })).toBeVisible();
    }
  });

  test("keeps a Greek visitor in Greek", async ({ page }) => {
    await page.goto(`/el${GONE}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Η σελίδα δεν βρέθηκε" })).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Αυτοκίνητα" }),
    ).toHaveAttribute("href", "/el/cars");
  });
});
