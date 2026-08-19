import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards the Content-Security-Policy against the failure mode that is hardest
 * to notice: a directive narrow enough to block something the site genuinely
 * needs, where the only symptom is a console error nobody is looking at.
 *
 * That is not hypothetical. Google Analytics was allowlisted as
 * `www.google-analytics.com`, which is not where GA4 sends anything. It posts
 * hits to a regional endpoint — `region1.google-analytics.com` for the EU, and
 * our visitors are almost entirely European — so every page_view was refused
 * by our own policy. The site looked perfect and the analytics were empty.
 *
 * These assertions read next.config.ts as text rather than importing it. The
 * config is a Next.js module with its own loader requirements, and the value
 * under test is a string; parsing the source is the honest way to check what
 * actually ships in the header.
 */

const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

/** Pulls one directive's value out of the shared BASE_CSP array. */
function directive(name: string): string {
  const match = config.match(new RegExp(`"${name} ([^"]+)"`));
  if (!match) throw new Error(`CSP directive "${name}" not found in next.config.ts`);
  return match[1];
}

describe("Content-Security-Policy", () => {
  it("allows GA4's regional collection endpoints, not just the www host", () => {
    const connect = directive("connect-src");
    // The wildcard is required: the subdomain varies by the visitor's region
    // (region1…region14), so no fixed host can cover real traffic.
    expect(connect).toContain("https://*.google-analytics.com");
    expect(connect).toContain("https://*.analytics.google.com");
  });

  it("allows GA4's image-beacon fallback", () => {
    expect(directive("img-src")).toContain("https://*.google-analytics.com");
  });

  it("still refuses images from arbitrary origins", () => {
    // The point of the directive above is to name Google's hosts, not to
    // reopen `https:` — which is what img-src used to be.
    const img = directive("img-src");
    expect(img).not.toMatch(/(^|\s)https:(\s|$)/);
    expect(img).not.toMatch(/(^|\s)\*(\s|$)/);
  });

  it("keeps Supabase reachable and everything else same-origin", () => {
    const connect = directive("connect-src");
    expect(connect).toMatch(/^'self'/);
    expect(connect).toContain("https://*.supabase.co");
  });

  it("does not silently acquire the advertising endpoints", () => {
    // Google's guide suggests adding these pre-emptively. We do not run Ads,
    // and if that changes it should be a deliberate edit with this test
    // updated, not a widening that arrived unexamined.
    const connect = directive("connect-src");
    for (const adHost of ["doubleclick.net", "googlesyndication.com"]) {
      expect(connect).not.toContain(adHost);
    }
  });

  it("keeps the directives that make the policy worth having", () => {
    for (const locked of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(config).toContain(`"${locked}"`);
    }
  });

  it("reports violations, so the next gap surfaces instead of hiding", () => {
    // Both the enforced and the report-only policy must carry the endpoint.
    expect(config.match(/report-uri \/api\/csp-report/g)?.length).toBe(2);
  });
});
