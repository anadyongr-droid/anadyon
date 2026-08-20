import base from "./playwright.config";
import { devices } from "@playwright/test";

/**
 * The same specs, against Safari and Firefox. Run on demand:
 *
 *   npm run test:browser:all
 *
 * Deliberately not part of CI, and the reason is specific rather than a
 * preference for speed. CI installs Chromium *without* `--with-deps`, because
 * that flag runs apt-get and once hung the job for nineteen minutes against a
 * normal run of one. It gets away with that because the GitHub Ubuntu image
 * already carries what headless Chromium needs — WebKit needs a further set of
 * libraries (libwoff2, libopus, the gstreamer stack) that the image does not
 * reliably carry, so putting it in CI means either reintroducing the apt-get
 * hang or a job that fails on a missing library.
 *
 * The concern behind wanting these browsers is real: this is a Greek tourism
 * site, so a large share of visitors arrive on an iPhone, and Tailwind v4
 * emits lab() and oklch() colours whose Safari support has been uneven.
 *
 * So it was measured rather than assumed. On 2026-08-20 all fourteen specs
 * passed on WebKit 26.5 and on Firefox 153 — no Safari-specific layout defect
 * exists in the surfaces these cover. That is the fact the CI job would have
 * been there to establish, and it is worth re-running after any significant
 * layout change.
 */
const crossBrowserConfig = {
  ...base,
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
};

export default crossBrowserConfig;
