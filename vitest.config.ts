import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The "@/…" alias comes from tsconfig paths, which Next resolves at build time
// but Vitest does not read. Without this, any module importing through the alias
// fails to resolve under test — which meant tests could only cover files that
// happened to use relative imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Fourteen test files boot a WASM PostgreSQL (PGlite) and replay migrations
    // into it, and Vitest's default 10s hook budget is not enough for that under
    // load. Measured on a four-core container, one boot plus `select 1` costs
    // 1.9s; the slowest of four concurrent boots costs 5.9s, of eight 11.7s and
    // of fourteen 21.3s, because WASM initialisation is CPU-bound. Ten seconds
    // is therefore crossed at around seven simultaneous boots — before a single
    // migration has replayed. Forced to `--maxWorkers=14` the suite failed four
    // files, every one with `Hook timed out in 10000ms`.
    //
    // It read as a flake because worker scheduling decides which files boot
    // together, so the full suite failed about two runs in eight and named a
    // different file each time. Two files had already been given their own
    // budget by hand, which stopped them failing and so stopped them reporting;
    // one number here replaces that, and lib/pgliteHookBudget.test.ts keeps it.
    //
    // A hook that starts a database engine is CPU-bound work making progress. A
    // timeout there exists to catch a hang, not to police slowness on a busy
    // machine, so this is ~30x the uncontended cost and still fails fast against
    // a deadlock.
    //
    // `testTimeout` is deliberately left at its default. Eight of the fourteen
    // files boot PGlite inside a test body rather than a hook, so no shared hook
    // budget reaches them; seven of those pass at the 5s default even at
    // fourteen-way, and the eighth — atomicBookingMigration, the heaviest —
    // carries its own 60s with the reasoning at the end of that file. Raising
    // this globally would weaken the budget on fifteen hundred fast tests to
    // cover one, which is the wrong trade; moving that setup into hooks is the
    // structural fix and is an open item.
    hookTimeout: 60_000,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // lib/seo.test.ts reads the prerendered HTML in .next/server/app, so it can
    // only run after `next build`. `npm test` runs before the build in CI, where
    // .next does not exist yet — and passed locally the whole time because a
    // previous build had left the directory populated. It has its own step in
    // the workflow, after the build; `npm run test:seo` runs it by hand.
    exclude: ["node_modules/**", ".next/**", "lib/seo.test.ts"],
    // Coverage is an on-demand diagnostic, not a merge gate. A percentage
    // cannot establish that a regression test would fail against the broken
    // implementation; the fail-first rule in AGENTS.md remains the standard.
    coverage: {
      provider: "v8",
      include: [
        "app/api/**/*.ts",
        "lib/**/*.ts",
        "proxy.ts",
        "instrumentation.ts",
        "instrumentation-client.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "lib/i18n/content/**",
      ],
      reporter: ["text", "json-summary", "lcov"],
    },
  },
});
