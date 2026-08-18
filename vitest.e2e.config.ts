import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// End-to-end tests run the real route handlers against the real Supabase
// project, so they are kept out of the default suite and run on demand.
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
