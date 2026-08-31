import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two AADE modules had no tests at all, and both filed wrong values.
 *
 * These are statutory submissions: a filing AADE *rejects* can be corrected,
 * but one it *accepts* carrying a wrong country or the wrong document type is a
 * false record that nobody will ever look at again. That asymmetry is why the
 * builders now refuse rather than default, and why the refusal is tested as
 * carefully as the success.
 *
 * The behavior-level suite calls the exported builders. These source checks
 * complement it by pinning the route safeguards and the exact literals a tax
 * filing turns on — the original bugs were `11.1` instead of `11.2`, and
 * `?? "GR"` swallowing an unknown country.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const dcl = read("app/api/admin/aade/submit/route.ts");
const invoices = read("app/api/admin/invoices/submit/route.ts");
const xml = read("lib/aadeXml.ts");

/**
 * The same file with its comments removed.
 *
 * Source-reading tests keep tripping on prose. This suite's "no `?? \"GR\"`"
 * check failed on the comment *explaining* that the old `?? "GR"` was removed,
 * and the damage-visibility suite hit the identical thing a few hours earlier.
 * A comment describing a defect must not read as the defect.
 *
 * String and template literals are preserved, because the endpoint assertions
 * match on URLs containing `//`.
 */
function code(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; out += ch; i += 1; continue; }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 2; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

describe("myDATA invoice type", () => {
  it("issues ΑΠΥ (11.2) to a private customer, not ΑΛΠ (11.1)", () => {
    // 11.1 is Απόδειξη Λιανικής Πώλησης — a retail receipt for *goods*.
    // 11.2 is Απόδειξη Παροχής Υπηρεσιών — for *services*. Renting a vehicle
    // is a service, and nearly every Anadyon customer is a private individual,
    // so 11.1 would have mis-typed almost every receipt issued.
    expect(xml).toMatch(/hasCounterpart \? "2\.1" : "11\.2"/);
    expect(code(xml), "the goods-receipt code is back")
      .not.toMatch(/: "11\.1"/);
  });

  it("still issues ΤΠΥ (2.1) to a business", () => {
    // The B2B branch was always right, and is what showed 11.1 to be a slip:
    // it already knew this is a service.
    expect(xml).toMatch(/hasCounterpart \? "2\.1"/);
  });
});

describe("country codes", () => {
  it("both modules resolve rather than pass a name through", () => {
    expect(xml.match(/toIsoCountry\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("neither defaults an unknown country to Greece", () => {
    // The original `?? "GR"` in both. AADE accepts it silently, which is what
    // makes it worse than a rejection.
    expect(code(xml), "a filing still defaults an unknown country to GR")
      .not.toMatch(/\?\?\s*["']GR["']/);
  });

  it("the client list reads country, not nationality", () => {
    // `nationality` is free text with the placeholder "e.g. British", and a
    // demonym is not a country. The column must also be selected, or it
    // resolves to null for every customer and nothing can ever be filed.
    expect(xml).toMatch(/toIsoCountry\(res\.customers\?\.country\)/);
    expect(dcl, "country is not in the select, so it is always undefined")
      .toMatch(/customers\([^)]*\bcountry\b[^)]*\)/);
  });
});

describe("refusing to file", () => {
  it("both raise rather than guess", () => {
    expect(xml).toMatch(/class UnfilableError extends Error/);
    expect(xml.match(/throw new UnfilableError\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("a refusal releases the claim instead of wedging the reservation", () => {
    // claim_dcl_submission and claim_invoice_submission refuse anything already
    // "submitting"/"issuing". A throw that escaped before the status was reset
    // would leave the row unclaimable forever, with no timeout and no retry —
    // so the catch must write the error status before returning.
    expect(dcl).toMatch(
      /catch \(err\)[\s\S]{0,200}?dcl_status: "error"[\s\S]{0,200}?UnfilableError[\s\S]{0,120}?status: 422/
    );
    expect(invoices).toMatch(
      /catch \(err\)[\s\S]{0,200}?invoice_status: "error"[\s\S]{0,200}?UnfilableError[\s\S]{0,120}?status: 422/
    );
  });

  it("an unexpected error is rethrown, not swallowed as a refusal", () => {
    // Reporting a genuine bug as "set the customer's country" would send
    // somebody to edit a record that was never the problem.
    for (const [name, src] of [["dcl", dcl], ["invoices", invoices]] as const) {
      expect(src, `${name} swallows non-Unfilable errors`).toMatch(/throw err;/);
    }
  });
});

describe("the sandbox switch", () => {
  it("both default to AADE's development endpoint", () => {
    // Testing before going live depends on this: only AADE_PRODUCTION === "true"
    // reaches the real register, so an unset variable is safe by default.
    for (const [name, src] of [["dcl", dcl], ["invoices", invoices]] as const) {
      expect(src, `${name} does not gate on AADE_PRODUCTION`)
        .toMatch(/process\.env\.AADE_PRODUCTION === "true"/);
      expect(src, `${name} would file live without the flag`)
        .toMatch(/AADE_PRODUCTION === "true"\s*\n?\s*\?\s*"https:\/\/mydatapi\.aade\.gr/);
      expect(src).toMatch(/:\s*"https:\/\/mydataapidev\.aade\.gr/);
    }
  });
});

describe("the comment stripper this suite depends on", () => {
  it("removes both comment forms", () => {
    expect(code('a // gone\nb')).toBe("a \nb");
    expect(code("a /* gone */ b")).toBe("a  b");
  });

  it("keeps string contents, including URLs with slashes", () => {
    // Without this the endpoint assertions above would match nothing, and
    // "both default to the sandbox" would pass by never finding anything.
    expect(code('const u = "https://mydatapi.aade.gr/x";')).toContain("https://mydatapi.aade.gr/x");
    expect(code('const s = "a /* not a comment */ b";')).toContain("/* not a comment */");
  });

  it("does not choke on an escaped quote", () => {
    expect(code('const s = "he said \\"hi\\""; // gone')).toContain('\\"hi\\"');
  });
});
