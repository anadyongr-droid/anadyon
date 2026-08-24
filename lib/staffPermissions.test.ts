import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a staff account may and may not do.
 *
 * Read from the source rather than exercised through the proxy, which needs a
 * live Supabase session to run. These assert the shape of the decision: which
 * paths appear, and — the part that is new — which methods each allows.
 *
 * The rule the whole list expresses: staff can do everything a rental needs
 * from enquiry to return, and nothing that decides what things cost.
 */
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

const staffApi = proxy.match(/const STAFF_API: StaffRoute\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const staffPages = proxy.match(/const STAFF_PAGES = \[([\s\S]*?)\n\];/)?.[1] ?? "";

/** The entry for one path, so its `methods` can be inspected. */
function entryFor(path: string): string | null {
  const line = staffApi
    .split("\n")
    .find((l) => l.includes(`path: "${path}"`));
  return line ?? null;
}

const grantsAllMethods = (path: string) => {
  const line = entryFor(path);
  return line !== null && !line.includes("methods");
};

const grantsReadOnly = (path: string) => {
  const line = entryFor(path);
  return line !== null && line.includes("READ_ONLY");
};

describe("the permission list is actually being read", () => {
  it("found both lists", () => {
    // A rename that broke these regexes would make every assertion vacuous.
    expect(staffApi.length).toBeGreaterThan(200);
    expect(staffPages.length).toBeGreaterThan(50);
  });
});

describe("servicing a rental, start to finish", () => {
  it.each([
    "/api/admin/operations",
    "/api/admin/reservations",
    "/api/admin/quotes",
    "/api/admin/customers",
    "/api/admin/emails",
    "/api/admin/documents",
    "/api/admin/vehicles",
  ])("staff may use %s fully", (path) => {
    expect(grantsAllMethods(path)).toBe(true);
  });

  it("staff may take payment and notify the customer", () => {
    for (const path of [
      "/api/admin/stripe/create-payment-link",
      "/api/admin/wise/deposit-link",
      "/api/admin/sms",
    ]) {
      expect(grantsAllMethods(path), path).toBe(true);
    }
  });

  it("staff may file the statutory declarations for a rental they handled", () => {
    expect(grantsAllMethods("/api/admin/aade/submit")).toBe(true);
    expect(grantsAllMethods("/api/admin/invoices/submit")).toBe(true);
  });
});

describe("reference data is readable, not writable", () => {
  it("the rate card is read-only for staff", () => {
    // The point of the method-aware list: /api/admin/rates serves both the
    // card and the edit that changes it.
    expect(grantsReadOnly("/api/admin/rates")).toBe(true);
    expect(grantsAllMethods("/api/admin/rates")).toBe(false);
  });

  it("the competitor comparison and its mapping are read-only for staff", () => {
    expect(grantsReadOnly("/api/admin/competitors/comparison")).toBe(true);
    expect(grantsReadOnly("/api/admin/competitors/mapping")).toBe(true);
  });

  it("the three competitor imports are runnable", () => {
    // These fetch competitors' published prices; none touches Anadyon's own,
    // so they are writes staff are meant to make.
    for (const path of [
      "/api/admin/competitors/carrentals",
      "/api/admin/competitors/faros",
      "/api/admin/competitors/scrape",
    ]) {
      expect(grantsAllMethods(path), path).toBe(true);
    }
  });
});

describe("what staff still may not reach", () => {
  it.each([
    ["/api/admin/promo-codes", "sets what a rental costs"],
    ["/api/admin/discount-rules", "sets what a rental costs"],
    ["/api/admin/users", "hands out access"],
    ["/api/admin/stats", "commercial reporting"],
    ["/api/admin/gmail", "mailbox credentials"],
  ])("%s is absent — %s", (path) => {
    expect(entryFor(path)).toBeNull();
  });

  it("grants the Stripe payment link without opening all of /api/admin/stripe", () => {
    // The narrower path matters: /api/admin/stripe/success is a separate route.
    expect(entryFor("/api/admin/stripe")).toBeNull();
    expect(grantsAllMethods("/api/admin/stripe/create-payment-link")).toBe(true);
  });
});

describe("pages match the APIs behind them", () => {
  it("staff can open Rates and Market", () => {
    expect(staffPages).toContain('"/admin/rates"');
    expect(staffPages).toContain('"/admin/market"');
  });

  it("still cannot open the screens that set prices or hand out access", () => {
    for (const page of ['"/admin/promo-codes"', '"/admin/discount-rules"', '"/admin/users"', '"/admin/settings"']) {
      expect(staffPages, page).not.toContain(page);
    }
  });

  it("never contains a bare /admin, which would prefix-match every page", () => {
    expect(staffPages).not.toMatch(/"\/admin"/);
  });
});

describe("the matcher checks the method, not only the path", () => {
  it("both halves are required", () => {
    const matcher = proxy.match(/function staffMayCall\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(matcher, "staffMayCall not found").not.toBe("");
    expect(matcher).toContain("route.methods");
    // Prefix matching is retained, so /api/admin/reservations/<id>/... works.
    expect(matcher).toContain('startsWith(route.path + "/")');
  });

  it("a route with no methods listed allows all of them", () => {
    const matcher = proxy.match(/function staffMayCall\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(matcher).toContain("!route.methods");
  });

  it("READ_ONLY is reads only", () => {
    const readOnly = proxy.match(/const READ_ONLY = \[([^\]]*)\]/)?.[1] ?? "";
    expect(readOnly).toContain("GET");
    for (const write of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(readOnly, write).not.toContain(write);
    }
  });
});
