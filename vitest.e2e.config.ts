import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// End-to-end tests run real route handlers against the isolated staging
// Supabase project. setup.ts refuses any URL that does not match the explicit
// staging ref, so this suite can never fall back to production.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    setupFiles: ["tests/e2e/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
