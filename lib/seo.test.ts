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

  // Asserted per locale rather than once. This test previously read only
  // quote.html and passed, while the Greek lookup page shipped indexable — the
  // English page had the directive and its translation never got it. A
  // single-locale assertion on a bilingual site is half a test.
  it.each([
    ["/quote", "quote.html"],
    ["/el/quote", "el/quote.html"],
  ])("keeps %s out of the index", (_route, file) => {
    // An account-style lookup with nothing anyone searches for, and the
    // individual quote pages are already noindex.
    const html = readFileSync(join(OUT, file), "utf8");
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });

  it("declares the same indexability on both sides of every hreflang pair", () => {
    // An hreflang pair pointing from a noindex page to an indexable one tells a
    // crawler two contradictory things about the same content.
    for (const [route, file] of pages) {
      const html = readFileSync(file, "utf8");
      const noindex = /<meta name="robots" content="noindex/.test(html);
      const twin = route.startsWith("/el")
        ? (route === "/el" ? "/" : route.slice(3))
        : (route === "/" ? "/el" : `/el${route}`);
      const twinEntry = pages.find(([r]) => r === twin);
      if (!twinEntry) continue;
      const twinHtml = readFileSync(twinEntry[1], "utf8");
      const twinNoindex = /<meta name="robots" content="noindex/.test(twinHtml);
      expect(`${route}=${noindex}`).toBe(`${route}=${twinNoindex}`);
    }
  });
});
