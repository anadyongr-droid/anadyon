import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-driven checks for surfaces the other suites structurally cannot see.
 *
 * The booking form does not exist in server HTML — it mounts only after a
 * customer clicks "Get Quote". Every check that fetches a page and inspects the
 * markup therefore reports it clean while never having looked at it. That has
 * caused two real misses: the translation checker passed 13 of 13 pages while
 * the whole form rendered in English, and the responsive sweep passed every
 * page while the promo code button was being pushed off narrow screens.
 *
 * The narrow widths matter too, but they were not the reason the second one
 * escaped. A wider viewport list would have found nothing, because the element
 * was outside the method rather than outside the viewport. This suite clicks
 * through to the state and measures what is actually on screen.
 *
 * It runs against a local production build rather than anadyon.gr: the point is
 * to fail before a change ships, not to confirm afterwards that it did.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/browser",
  // A real browser is slower than the unit suite; these are worth the wait but
  // should not hang CI if a page never settles.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // Only Chromium is installed. Firefox and WebKit would roughly triple the CI
  // download for coverage the build's own browser targets already constrain —
  // Chrome/Edge/Firefox 111 and Safari 16.4, all with sRGB fallbacks in the CSS
  // so older engines degrade rather than break. Layout overflow, which is what
  // this suite exists to catch, is not engine-specific in the ways being
  // tested here.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Locally this reuses a server that is already up, which is what you want
  // while iterating — but it will happily reuse one started from a different
  // build. A stale .next made two tests skip and sent me looking at the code
  // instead of the artefacts. If results look wrong, rebuild and restart
  // before believing them.
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
