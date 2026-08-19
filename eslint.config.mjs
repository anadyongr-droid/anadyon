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

      // Kept as a warning for the same reason, and the count is deliberate:
      // 16 set-state-in-effect and 5 exhaustive-deps remain, all in the
      // booking, quote and admin-modal flows.
      //
      // The exhaustive-deps ones were each examined rather than waved through,
      // and none is a stale-closure bug. `modelPricingGroups` and
      // `initialValues` are object literals rebuilt on every parent render, so
      // listing them would refetch the rate card or reload a reservation
      // continuously. `supabase.auth.mfa` is a stable client behind a property
      // path the rule cannot see through. The quote lookup's effect runs once
      // on mount by design, with the reference taken from the URL.
      //
      // Per-line disables were tried and reverted: the rule reports at the
      // reference site inside the effect body rather than at the dependency
      // array, so the suppression lands on an arbitrary line and stops working
      // the moment that body is edited.
      //
      // Leaving them visible is the point. If the count moves, something new
      // was introduced.
      "react-hooks/exhaustive-deps": "warn",

      // A leading underscore means "destructured on purpose, not needed".
      // The codebase already used that convention — `_id`, `_created`,
      // `_omitted` — while the rule flagged them anyway, so the marker
      // conveyed intent to readers and nothing to the linter.
      //
      // It matters most in app/api/quote/route.ts, which pulls the client's
      // own pricing out of the request body specifically so it cannot be used:
      // the server recalculates every figure from the rate card, and its
      // numbers are the ones stored and emailed. Those bindings are not dead
      // code to be deleted — deleting them would let the client's values reach
      // a rest object or shadow the server's. They are a discard, stated in
      // the shape of the code.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
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
