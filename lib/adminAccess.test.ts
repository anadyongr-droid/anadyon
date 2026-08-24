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
    // Anchored on the role lookup's own catch, identified by the message it
    // logs, rather than on "the first catch block in the file". Bounding the
    // auth calls with timeouts introduced an earlier catch, and a positional
    // match then started asserting against the wrong block — passing or
    // failing for reasons that had nothing to do with this rule.
    const cat = proxy.match(/catch \(err\) \{[\s\S]*?role lookup failed[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(cat, "could not find the role lookup's catch block").not.toBe("");
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
    //
    // Anchored on the staff API check wherever it now lives. It was
    // `matchesAny(pathname, STAFF_API)` until that list became method-aware
    // and the call became `staffMayCall`; the rule being guarded is unchanged,
    // and the assertion failing on the rename is the check working.
    const denial = proxy.indexOf('refusing admin access');
    const staffPathCheck = proxy.indexOf('staffMayCall(pathname, req.method)');
    expect(denial, "roleless denial not found").toBeGreaterThan(-1);
    expect(staffPathCheck, "staff API check not found").toBeGreaterThan(-1);
    expect(denial).toBeLessThan(staffPathCheck);
  });

  it("keeps user management out of the staff allowlists", () => {
    // The screen that hands out access must never be reachable by the role it
    // hands out. Both lists are checked, because a page entry and an API entry
    // are added in different places and only one of them is obvious.
    const staffPages = proxy.match(/const STAFF_PAGES[\s\S]*?\];/)?.[0] ?? "";
    const staffApi = proxy.match(/const STAFF_API[\s\S]*?\];/)?.[0] ?? "";
    expect(staffPages).not.toContain("/admin/users");
    expect(staffApi).not.toContain("/api/admin/users");
  });

  it("still reads the role from app_metadata, never user_metadata", () => {
    // user_metadata is editable by the account holder; using it for an
    // authorisation decision would let anyone promote themselves.
    expect(proxy).not.toMatch(/user_metadata\?\.role/);
  });
});

/**
 * The users API can grant access to the customer database, so its own guards
 * are asserted rather than assumed. These read the route source: exercising it
 * needs a live Supabase session and a service-role key, and a test that cannot
 * run is worse than one that reads what the code commits to.
 */
describe("user management API", () => {
  const route = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");

  it("checks the caller is an admin on every method", () => {
    const methods = route.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? [];
    expect(methods.length).toBe(4);
    // One guard per exported method, none relying solely on the proxy.
    const guards = route.match(/callerRole\(req\) !== "admin"/g) ?? [];
    expect(guards.length).toBe(methods.length);
  });

  it("refuses to let an admin change their own role or delete themselves", () => {
    // Either would strand the admin area with no one able to administer it.
    expect(route).toMatch(/cannot change your own role/i);
    expect(route).toMatch(/cannot remove your own account/i);
  });

  it("refuses to remove the last administrator", () => {
    expect(route).toMatch(/only administrator/i);
  });

  it("validates the role against the shared list rather than free text", () => {
    expect(route).toContain("isRole(");
    expect(route).not.toMatch(/role === "admin" \|\| role === "staff"/);
  });

  it("invites rather than setting a password", () => {
    // Nobody should be typing a colleague's password, least of all into this
    // app. Asserted against code rather than the word itself, which appears
    // legitimately in the comment explaining why invitations are used.
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("inviteUserByEmail");
    expect(code).not.toMatch(/password\s*[:=]/i);
    expect(code).not.toContain("createUser(");
  });

  it("writes the role to app_metadata, which the account holder cannot edit", () => {
    expect(route).toContain("app_metadata: { role }");
    expect(route).not.toContain("user_metadata: { role }");
  });
});
