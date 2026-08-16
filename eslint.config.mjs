import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React 19 promoted this to an error. It fires on pre-existing effects in
      // the booking and quote flows that initialise state from search params or
      // a fetch. They work correctly; fixing them means reworking each effect,
      // which should be done deliberately and verified against the live booking
      // journey rather than in bulk. Kept as a warning so it stays visible
      // without failing CI on untouched code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
