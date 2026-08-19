import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Keeps the public quote lookup from returning more of a customer's record
 * than the page actually shows them.
 *
 * The endpoint is gated on a booking reference plus a surname. That is a
 * deliberately low bar — a customer who has lost their email should be able to
 * get back in — which is precisely why what sits behind it matters. It used to
 * `select("*")`, so all 42 columns of the quote went to the browser and 13 were
 * never rendered: date of birth, street address, city, postal code, country,
 * both phone numbers, flight number, and the internal ids.
 *
 * The failure this guards against is not someone editing the select list. It is
 * someone adding a column to the `quotes` table months from now — an internal
 * note, a margin, a risk flag — and never learning that a public endpoint
 * started serving it.
 */

const route = readFileSync(new URL("../app/api/quote/[ref]/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/quote/[ref]/page.tsx", import.meta.url), "utf8");

/** The literal column list the route sends to PostgREST. */
function selectedColumns(): string[] {
  const m = route.match(/const QUOTE_COLUMNS = "([^"]+)"/);
  if (!m) throw new Error("QUOTE_COLUMNS literal not found — did the select stop being a literal?");
  return m[1].split(",").map((c) => c.trim()).filter(Boolean);
}

/** The fields the page's own `Quote` type declares. */
function renderedFields(): string[] {
  const block = page.match(/type Quote = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("Quote type not found in app/quote/[ref]/page.tsx");
  return [...block[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

describe("public quote lookup exposure", () => {
  it("never selects with a wildcard", () => {
    // The whole point: a wildcard re-publishes every future column silently.
    expect(route).not.toMatch(/\.from\("quotes"\)[\s\S]{0,60}\.select\("\*"\)/);
  });

  it("sends nothing the page does not display", () => {
    const extra = selectedColumns().filter((c) => !renderedFields().includes(c));
    expect(extra).toEqual([]);
  });

  it("sends everything the page does display", () => {
    const missing = renderedFields().filter((f) => !selectedColumns().includes(f));
    expect(missing).toEqual([]);
  });

  it("withholds the identity fields specifically", () => {
    // Named individually rather than left to the comparison above, so the
    // intent survives someone rewriting these tests.
    const sensitive = [
      "dob", "address", "city", "postal_code", "country",
      "mobile_tel", "landline_tel", "flight_number", "customer_id",
    ];
    for (const field of sensitive) {
      expect(selectedColumns()).not.toContain(field);
    }
  });

  it("still selects what the route itself needs to enforce its own checks", () => {
    // Dropping either of these would not fail a type check — it would silently
    // stop the surname gate or the expiry gate from working.
    expect(selectedColumns()).toContain("last_name");
    expect(selectedColumns()).toContain("expires_at");
  });

  it("resolves the client IP from the platform header, not a client-supplied one", () => {
    // The brute-force guard is the only thing between a guessed reference and
    // this data; it must not key off a header the caller can set.
    const ipFn = route.match(/async function getIp[\s\S]*?\n}/)?.[0] ?? "";
    const first = ipFn.indexOf("x-vercel-forwarded-for");
    const fwd = ipFn.indexOf('"x-forwarded-for"');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(fwd);
  });
});
