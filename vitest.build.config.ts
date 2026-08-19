import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Checks that read the build output rather than the source.
 *
 * These cannot run in the default suite: `npm test` runs before `next build`
 * in CI, and .next/server/app does not exist yet at that point. They passed
 * locally regardless, because a previous build had left the directory in
 * place — so the suite was green on this machine and red on every push.
 *
 * Kept in a separate config rather than an exclude-plus-filter, because
 * vitest's `exclude` also wins over an explicit file argument: excluding the
 * file in the main config and then naming it on the command line runs nothing
 * at all, and reports success while doing so.
 *
 * Mirrors vitest.e2e.config.ts, which separates its suite for the same kind of
 * reason.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/seo.test.ts"],
  },
});
