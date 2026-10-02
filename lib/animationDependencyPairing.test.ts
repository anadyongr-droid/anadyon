import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `framer-motion` and `motion-dom` must be a pairing that actually links.
 *
 * **A03, from Codex's 2 October audit, and the defect was mine.** On 2 October I
 * took dependabot's `framer-motion` 13.4.3 but let npm resolve `motion-dom`
 * itself, reasoning on #193 that *"pinning a transitive dependency to hold it
 * back would be worse than letting npm resolve it"*. Dependabot had proposed
 * `motion-dom` **13.4.2**; npm resolved **13.5.0**, which satisfies
 * `framer-motion`'s declared `^13.4.2` and **removed the `observeTimeline`
 * export that `framer-motion` 13.4.3 imports**. `npm run build:verify` then
 * failed:
 *
 *     Attempted import error: 'observeTimeline' is not exported from 'motion-dom'
 *
 * Three things make this worth a permanent test rather than a one-line pin.
 *
 * **The caret range lied.** A semver-compatible resolution removed a symbol its
 * consumer imports, so "within range" proved nothing. No lockfile review would
 * have caught it either — both versions look unremarkable in a diff.
 *
 * **The gate did not catch it.** GitHub CI runs `next build`, whose default
 * builder tree-shakes the unused scroll path away; the repository's own
 * `build:verify` runs `next build --webpack`, which does not. So CI was green on
 * a commit that could not pass the project's own release verifier — exactly the
 * §8 failure of a gate overstating assurance. `verify:fast` does not build at
 * all, and `verify:fast` is what I ran.
 *
 * **Production was never broken, and saying so precisely matters.** The app
 * imports only `motion` and `Variants`, in one file; nothing calls `scroll` or
 * `useScroll`, so the unresolvable module sits in dead code that the production
 * builder drops. This was a broken *build*, not a broken site.
 *
 * **The fix pins forward, not back.** The obvious repair was `motion-dom`
 * 13.4.2 — dependabot's own figure, and the last version before the export
 * vanished. Checking the registry instead showed **13.5.1 restores
 * `observeTimeline`**: 13.5.0 was simply a broken release. So the `overrides`
 * entry in `package.json` pins *past* the bad version rather than behind it,
 * which takes the upstream repair instead of freezing on the last version that
 * happened to work. Verified: `next build --webpack` reports
 * "Compiled successfully".
 *
 * This test checks the invariant rather than the version, so it catches **every**
 * symbol rather than `observeTimeline` alone — the next instance of this class
 * will involve a different name — and it catches it in `verify:fast`, in
 * milliseconds, instead of only in a webpack build that CI does not run.
 */

const require_ = createRequire(import.meta.url);

/**
 * The resolved `motion-dom` as `framer-motion` itself sees it.
 *
 * Resolved through `framer-motion`'s own require, so a nested copy installed by
 * the `overrides` pin is found rather than any hoisted one — that distinction is
 * the whole point here. `motion-dom` does not expose `./package.json` in its
 * exports map, so the package root is found by walking up from the entry.
 */
function resolvedMotionDomDir(): string {
  const framerPkg = require_.resolve("framer-motion/package.json");
  const framerRequire = createRequire(framerPkg);
  let dir = dirname(framerRequire.resolve("motion-dom"));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate the motion-dom package root");
}

function resolvedMotionDomEsm(): string {
  const dir = resolvedMotionDomDir();
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  // The ESM entry is what a bundler follows, and the CJS entry is not a
  // substitute: the failure was specific to the ESM named exports.
  const entry = pkg.exports?.["."]?.import ?? pkg.module ?? "./dist/es/index.mjs";
  return readFileSync(join(dir, entry.replace(/^\.\//, "")), "utf8");
}

/** Every named symbol `framer-motion`'s ESM build imports from `motion-dom`. */
function symbolsFramerImportsFromMotionDom(): Set<string> {
  const framerDir = join(dirname(require_.resolve("framer-motion/package.json")), "dist/es");
  const found = new Set<string>();

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".mjs")) continue;
      const text = readFileSync(full, "utf8");
      // `import { a, b as c } from 'motion-dom';`
      for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]motion-dom['"]/g)) {
        for (const part of m[1].split(",")) {
          const symbol = part.trim().split(/\s+as\s+/)[0].trim();
          if (symbol) found.add(symbol);
        }
      }
    }
  };

  walk(framerDir);
  return found;
}

describe("framer-motion and motion-dom link against each other", () => {
  const esm = resolvedMotionDomEsm();
  const symbols = [...symbolsFramerImportsFromMotionDom()].sort();

  it("found the imports to check, so a clean sweep is not an empty one", () => {
    // A guard on the instrument. If framer-motion stops importing from
    // motion-dom entirely, this test has no subject and should be deleted
    // rather than left passing vacuously.
    expect(symbols.length).toBeGreaterThan(5);
    expect(symbols).toContain("observeTimeline");
  });

  it("motion-dom exports every symbol framer-motion imports from it", () => {
    // The specific failure was `observeTimeline` disappearing in 13.5.0, but the
    // class is "a semver-compatible resolution drops an export", so every symbol
    // is checked and the failure names the ones that are missing.
    const missing = symbols.filter(s => !new RegExp(`\\b${s}\\b`).test(esm));
    expect(
      missing,
      `motion-dom no longer exports: ${missing.join(", ")}. ` +
        "A semver-compatible bump removed a symbol framer-motion imports; " +
        "check the `overrides` pin in package.json.",
    ).toEqual([]);
  });

  it("keeps the override that steers the resolution deliberately", () => {
    // `framer-motion` asks for `^13.4.2`, which still admits the broken 13.5.0.
    // Without an explicit choice the resolution is whatever npm picks on the day,
    // and the only signal is a webpack build CI does not run.
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8"));
    expect(pkg.overrides?.["motion-dom"], "the motion-dom override").toBeTruthy();
    // Forward of the broken release, not behind it.
    expect(pkg.overrides["motion-dom"]).not.toBe("13.5.0");
  });
});
