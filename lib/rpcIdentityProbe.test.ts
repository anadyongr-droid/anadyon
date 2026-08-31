import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The diagnostic route only tests something if it uses the right client.
 *
 * Every other admin route reaches Supabase through `supabaseAdmin`, the service
 * role, under which `auth.uid()` is NULL — that is the defect the whole
 * question is about. This route exists to call the same function through a
 * *user-scoped* client instead. Swap the client and it still returns 200,
 * still looks like it worked, and proves nothing at all.
 *
 * That is a test worth having precisely because the failure is silent.
 */
const root = new URL("../", import.meta.url).pathname;
const route = readFileSync(
  join(root, "app/api/admin/diagnostics/rpc-identity/route.ts"),
  "utf8"
);

/** Strips comments, so the explanation of why not to use supabaseAdmin does not read as using it. */
const code = route.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("the rpc identity probe", () => {
  it("builds a client from the session cookies", () => {
    expect(code).toMatch(/createServerClient\(/);
    expect(code).toMatch(/cookies\(\)/);
  });

  it("never reaches for the service role", () => {
    expect(
      code,
      "supabaseAdmin makes auth.uid() NULL by definition — the probe would answer its own question wrongly"
    ).not.toMatch(/supabaseAdmin/);
  });

  it("calls the probe function", () => {
    expect(code).toMatch(/\.rpc\("whoami_probe"\)/);
  });

  it("distinguishes a missing function from a null uid", () => {
    // "function does not exist" means the SQL was never run. Reporting that as
    // "Option A is falsified" would retire a working design on a typo.
    expect(code).toMatch(/if \(error\)/);
    expect(code).toMatch(/hint/);
  });

  it("says which way to read the result", () => {
    expect(code).toMatch(/verdict/);
  });
});

describe("it is marked as temporary", () => {
  it("says so, and says how to remove it", () => {
    // A diagnostic left in place becomes an endpoint nobody remembers adding.
    expect(route).toMatch(/TEMPORARY/);
    expect(route).toMatch(/drop function if exists public\.whoami_probe\(\)/);
  });
});
