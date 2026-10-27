import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The relay must not reach into the rental application.
 *
 * §6.2 of the proposal requires the relay to be *"a separate project and
 * credential boundary from the rental application"*, so that a compromise
 * *"must not reveal Supabase, Vercel production, Resend, Stripe, AADE or
 * administrative-mail credentials"*.
 *
 * **This directory is inside that application's repository, which does not
 * satisfy the requirement** — it is a Stage 1 proof of concept and the README
 * says so. This test is the thing that stops the deviation getting worse while
 * it lasts: the moment any file here imports from `lib/`, `app/` or `scripts/`,
 * extracting the relay to its own repository stops being a move and becomes a
 * refactor.
 *
 * It is a cheap guard against an expensive coupling, not a substitute for the
 * extraction, which remains a precondition of Stage 2.
 */

const here = join("services", "mail-bridge");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

describe("the mail bridge stays separable from the application", () => {
  const files = sourceFiles(here);

  it("finds the source files, so the assertions below are not vacuous", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["@/lib", /from\s+["']@\/lib/],
    ["@/app", /from\s+["']@\/app/],
    ["@/components", /from\s+["']@\/components/],
    ["a relative climb out of the service", /from\s+["']\.\.\/\.\.\/\.\.\//],
  ])("imports nothing from %s", (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(offenders, `these files reach into the application: ${offenders.join(", ")}`).toEqual([]);
  });

  it("holds no credential-shaped literal", () => {
    // Not a secret scanner. It catches the specific mistake of pasting a token
    // into the proof of concept "just to test it", which is how a credential
    // reaches a public repository.
    const shapes = [
      /1000\.[0-9a-f]{32}\.[0-9a-f]{32}/i, // Zoho client id / token shape
      /\bya29\.[A-Za-z0-9_-]{20,}/,        // Google OAuth access token
      /\bre_[A-Za-z0-9]{20,}/,             // Resend
      /\bsk_(live|test)_[A-Za-z0-9]{20,}/, // Stripe
      /\beyJ[A-Za-z0-9_-]{30,}\./,         // a JWT, e.g. a Supabase key
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const shape of shapes) {
        expect(shape.test(text), `${file} contains something shaped like a credential`).toBe(false);
      }
    }
  });
});
