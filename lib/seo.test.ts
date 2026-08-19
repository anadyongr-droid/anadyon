import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Metadata regression, run against the built HTML.
 *
 * Six English pages shipped with no alternate-language links at all while their
 * Greek counterparts declared the pair — so a search engine landing on an
 * English page had no indication a Greek version existed. Source review missed
 * it because the pages had an `alternates` block; it simply had no `languages`.
 * Only the rendered output settles it.
 */
const OUT = ".next/server/app";

function publicPages(): [string, string][] {
  const found: [string, string][] = [];
  const walk = (dir: string, prefix = "") => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`);
      else if (entry.endsWith(".html")) {
        const route = `${prefix}/${entry.replace(/\.html$/, "")}` || "/";
        if (route.startsWith("/_") || route.startsWith("/admin")) continue;
        found.push([route, full]);
      }
    }
  };
  if (existsSync(OUT)) walk(OUT);
  return found.sort();
}

const pages = publicPages();

describe("rendered SEO metadata", () => {
  it("finds built pages to check", () => {
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(20);
  });

  it.each(pages)("%s declares en, el and x-default", (_route, file) => {
    const html = readFileSync(file, "utf8");
    const langs = new Set(
      [...html.matchAll(/<link rel="alternate" hrefLang="([a-zA-Z-]+)"/g)].map((m) => m[1])
    );
    expect([...langs].sort()).toEqual(["el", "en", "x-default"]);
  });

  it.each(pages)("%s has exactly one canonical", (_route, file) => {
    const html = readFileSync(file, "utf8");
    expect((html.match(/<link rel="canonical"/g) ?? []).length).toBe(1);
  });

  it("keeps the quote lookup out of the index", () => {
    // An account-style lookup with nothing anyone searches for, and the
    // individual quote pages are already noindex.
    const html = readFileSync(join(OUT, "quote.html"), "utf8");
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });
});
