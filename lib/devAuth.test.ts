import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { devAuthRole } from "@/lib/devAuth";

/**
 * The development sign-in bypass, and the reasons it must stay
 * development-only.
 *
 * Two halves. The first exercises the decision on its own, which is where the
 * three conditions live. The second drives the real middleware, because a
 * correct decision wired in wrongly is still an open door — and because the
 * property that actually matters is not "the function returned null" but "the
 * request went to Supabase after all".
 *
 * Every deny case is written as its own test rather than as a table, so a
 * failure names the condition that stopped being required.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAal: vi.fn(),
  listFactors: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAal,
        listFactors: mocks.listFactors,
      },
    },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } } },
  supabase: {},
}));

const { proxy } = await import("@/proxy");

/** How NextResponse.next({ request: { headers } }) carries a header onward. */
const RESOLVED_ROLE = "x-middleware-request-x-anadyon-role";

const request = (path: string, init: RequestInit = {}) =>
  new NextRequest(new Request(`http://localhost:3000${path}`, init));

/** The environment a development container actually has: dev, no Vercel. */
function inDevelopmentContainer(role?: string) {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("ANADYON_DEV_AUTH_ROLE", role);
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.getAal.mockReset();
  mocks.listFactors.mockReset();
  mocks.getUserById.mockReset();
  // A signed-in administrator who passes MFA, so anything reaching the real
  // path succeeds. A leak therefore looks like success rather than like an
  // error — the way round that actually catches a bypass nobody meant to ship.
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "admin@anadyon.gr", app_metadata: { role: "admin" } } },
  });
  mocks.getAal.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" } });
  mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: "f1" }] } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("devAuthRole — the three conditions", () => {
  const dev = { nodeEnv: "development", vercel: undefined };

  it("resolves the role a developer asked for", () => {
    expect(devAuthRole({ ...dev, role: "admin" })).toBe("admin");
    expect(devAuthRole({ ...dev, role: "staff" })).toBe("staff");
  });

  it("refuses when NODE_ENV is production — what `next build` sets", () => {
    expect(devAuthRole({ nodeEnv: "production", vercel: undefined, role: "admin" })).toBeNull();
  });

  it("refuses under the test runner, so a green suite is never the bypass", () => {
    expect(devAuthRole({ nodeEnv: "test", vercel: undefined, role: "admin" })).toBeNull();
  });

  it("refuses when NODE_ENV is unset", () => {
    expect(devAuthRole({ nodeEnv: undefined, vercel: undefined, role: "admin" })).toBeNull();
  });

  it("refuses on Vercel even when NODE_ENV says development", () => {
    // The realistic way condition 1 gets defeated is somebody setting NODE_ENV
    // in project settings. VERCEL is set by the platform and cannot be talked
    // out of it, so this is the condition that has to survive that.
    expect(devAuthRole({ nodeEnv: "development", vercel: "1", role: "admin" })).toBeNull();
    expect(devAuthRole({ nodeEnv: "development", vercel: "0", role: "admin" })).toBeNull();
  });

  it("refuses when no role was asked for", () => {
    expect(devAuthRole({ ...dev, role: undefined })).toBeNull();
    expect(devAuthRole({ ...dev, role: "" })).toBeNull();
  });

  it("refuses anything that is not exactly a role", () => {
    // No truthiness, no case folding, no trimming. "1" and "true" are what a
    // person reaches for when they think a switch is a boolean, and this is
    // not a boolean — it is a statement of which chair you are sitting in.
    const notRoles = ["1", "true", "yes", "on", "Admin", "ADMIN", "staff ", " staff", "admin,staff", "superuser"];
    for (const value of notRoles) {
      expect(devAuthRole({ ...dev, role: value }), value).toBeNull();
    }
  });
});

describe("the middleware with the bypass available", () => {
  it("serves an admin page without asking Supabase anything", async () => {
    inDevelopmentContainer("admin");
    const res = await proxy(request("/admin/fleet"));

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get(RESOLVED_ROLE)).toBe("admin");
  });

  it("says loudly, on every request, that it is doing so", async () => {
    inDevelopmentContainer("admin");
    await proxy(request("/admin/fleet"));
    await proxy(request("/admin/today"));

    // Per request, not once at boot: a bypass that announces itself only at
    // start-up is a bypass you forget is on.
    const warned = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
    expect(warned).toHaveLength(2);
    expect(warned[0]).toContain("DEVELOPMENT AUTH BYPASS");
    expect(warned[1]).toContain("/admin/today");
  });

  it("still applies the staff/administrator split to pages", async () => {
    inDevelopmentContainer("staff");
    const res = await proxy(request("/admin/settings"));

    // The point of the staff role locally is to see what staff see. A bypass
    // that resolved everybody to an administrator would answer the wrong
    // question while looking like it had answered the right one.
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/reservations");
  });

  it("still applies it to the API, method and all", async () => {
    inDevelopmentContainer("staff");
    expect((await proxy(request("/api/admin/users"))).status).toBe(403);
    expect((await proxy(request("/api/admin/rates", { method: "PATCH" }))).status).toBe(403);
    expect((await proxy(request("/api/admin/reservations"))).status).toBe(200);
  });

  it("overwrites a role header the caller sent, rather than trusting it", async () => {
    inDevelopmentContainer("staff");
    const res = await proxy(request("/admin/today", { headers: { "x-anadyon-role": "admin" } }));
    expect(res.headers.get(RESOLVED_ROLE)).toBe("staff");
  });
});

describe("the middleware where the bypass must not exist", () => {
  /**
   * These are the tests that fail if this ever becomes reachable in a
   * deployment. Each sets the role variable — the thing an accident or an
   * attacker would supply — and asserts the request went to Supabase anyway.
   */

  it("goes to Supabase in a production build, even with the role variable set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("ANADYON_DEV_AUTH_ROLE", "admin");

    await proxy(request("/admin/fleet"));
    expect(mocks.getUser).toHaveBeenCalled();
  });

  it("goes to Supabase on Vercel, even with NODE_ENV and the role variable set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANADYON_DEV_AUTH_ROLE", "admin");

    await proxy(request("/admin/fleet"));
    expect(mocks.getUser).toHaveBeenCalled();
  });

  it("goes to Supabase in a development container that did not opt in", async () => {
    inDevelopmentContainer(undefined);

    await proxy(request("/admin/fleet"));
    expect(mocks.getUser).toHaveBeenCalled();
  });

  it("is not something the browser can turn on", async () => {
    // The variable is read from the server environment. Sending it as a header
    // or a cookie has to do nothing at all.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANADYON_DEV_AUTH_ROLE", undefined);

    await proxy(request("/admin/fleet", {
      headers: {
        "x-anadyon-role": "admin",
        "x-anadyon-dev-auth-role": "admin",
        cookie: "ANADYON_DEV_AUTH_ROLE=admin",
      },
    }));
    expect(mocks.getUser).toHaveBeenCalled();
  });
});

describe("the switch never reaches the browser", () => {
  it("is nowhere NEXT_PUBLIC_-prefixed in the tree", async () => {
    // Next.js inlines NEXT_PUBLIC_* into the client bundle, so a rename that
    // added the prefix would publish the switch to every visitor. `git grep`
    // exits 1 with no matches, which is the passing case.
    const { execFileSync } = await import("node:child_process");
    let hits = "";
    try {
      // Assembled from parts so this file is not itself the match — the first
      // version of this test failed against a tree that was perfectly clean.
      const forbidden = "NEXT_PUBLIC_" + "ANADYON_DEV_AUTH";
      hits = execFileSync("git", ["grep", "-lI", forbidden], {
        encoding: "utf8",
        cwd: process.cwd(),
      });
    } catch {
      hits = "";
    }
    expect(hits.trim()).toBe("");
  });
});
