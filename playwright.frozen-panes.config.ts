import { defineConfig, devices } from "@playwright/test";

/**
 * The frozen-pane spec uses page.setContent() and does not need the Next.js
 * server. Keeping it in a server-free configuration makes the iPad/WebKit
 * check repeatable even when no production build exists locally.
 */
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  reporter: [["list"]],
  projects: [
    { name: "webkit-ipad", use: { ...devices["iPad (gen 7)"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
