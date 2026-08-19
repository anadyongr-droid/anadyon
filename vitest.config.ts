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
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // lib/seo.test.ts reads the prerendered HTML in .next/server/app, so it can
    // only run after `next build`. `npm test` runs before the build in CI, where
    // .next does not exist yet — and passed locally the whole time because a
    // previous build had left the directory populated. It has its own step in
    // the workflow, after the build; `npm run test:seo` runs it by hand.
    exclude: ["node_modules/**", ".next/**", "lib/seo.test.ts"],
  },
});
