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
    exclude: ["node_modules/**", ".next/**"],
  },
});
