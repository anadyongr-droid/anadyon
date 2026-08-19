import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards the rule that decides who reaches the admin area.
 *
 * The proxy resolves a role from `app_metadata` and, when it found none, used
 * to fall back to "staff". The comment called that denying privilege. It is
 * not: "staff" reaches /admin/customers, /admin/reservations, /admin/quotes
 * and /admin/inbox, so an account carrying no role at all was granted the
 * customer database.
 *
 * Nothing in the proxy checks the user against a roster of people who work
 * here, so the only barrier was holding an account — and signup is enabled on
 * the Supabase project, reachable with the anon key that ships in every
 * visitor's browser bundle. The full chain was: sign up, confirm your own
 * address, enrol your own authenticator at the setup page the proxy redirects
 * you to, and inherit staff.
 *
 * These assertions read the source rather than exercising the proxy, which
 * needs a live Supabase session to run. They are deliberately about the shape
 * of the decision: that the fallback is empty, that an unknown role is refused,
 * and that the refusal cannot be reordered after the code which trusts it.
 */
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

describe("admin access control", () => {
  it("never defaults an unresolved role to a privileged one", () => {
    // The specific regression: `?? "staff"` on the metadata lookup.
    expect(proxy).not.toMatch(/app_metadata\?\.role as string \| undefined\) \?\? "staff"/);
    expect(proxy).toMatch(/app_metadata\?\.role as string \| undefined\) \?\? ""/);
  });

  it("denies rather than downgrades when the role lookup throws", () => {
    const cat = proxy.match(/catch \(err\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(cat).toContain('role = ""');
    expect(cat).not.toContain('role = "staff"');
  });

  it("refuses any role that is not explicitly admin or staff", () => {
    expect(proxy).toMatch(/if \(role !== "admin" && role !== "staff"\)/);
  });

  it("answers APIs with 403 and pages with a redirect", () => {
    const gate = proxy.match(/if \(role !== "admin" && role !== "staff"\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(gate).toMatch(/status: 403/);
    expect(gate).toMatch(/admin\/login/);
  });

  it("refuses before the staff allowlist is consulted", () => {
    // If the roleless check ran after the staff-path check, an unknown user
    // would already have been handed the staff pages by the time it fired.
    const denial = proxy.indexOf('refusing admin access');
    const staffPathCheck = proxy.indexOf('matchesAny(pathname, STAFF_API)');
    expect(denial).toBeGreaterThan(-1);
    expect(staffPathCheck).toBeGreaterThan(-1);
    expect(denial).toBeLessThan(staffPathCheck);
  });

  it("still reads the role from app_metadata, never user_metadata", () => {
    // user_metadata is editable by the account holder; using it for an
    // authorisation decision would let anyone promote themselves.
    expect(proxy).not.toMatch(/user_metadata\?\.role/);
  });
});
