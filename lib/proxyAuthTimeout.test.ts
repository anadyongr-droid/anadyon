import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * What the middleware does when Supabase Auth stops answering.
 *
 * On 2026-08-23 the admin area became unreachable: outbound Auth calls did not
 * complete, nothing here had a deadline, and the invocation ran to the
 * platform's 300-second ceiling. Every admin page and API call behaved the
 * same way. These tests pin the two properties that must hold instead —
 * it gives up quickly, and it never resolves a role it could not read.
 *
 * See docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md.
 */

/** A promise that never settles — the failure being reproduced. */
const neverAnswers = <T>(): Promise<T> => new Promise<T>(() => {});

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

const ADMIN = {
  data: {
    user: { id: "user-1", email: "admin@anadyon.gr", app_metadata: { role: "admin" } },
  },
};

const request = (path = "/admin") =>
  new NextRequest(new Request(`https://anadyon.gr${path}`, {
    headers: { cookie: "sb-access-token=stub" },
  }));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.getUser.mockReset();
  mocks.getAal.mockReset();
  mocks.listFactors.mockReset();
  mocks.getUserById.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Runs the middleware while pushing fake time forward past every deadline. */
async function runPastTimeouts(path = "/admin") {
  const pending = proxy(request(path));
  // Three consecutive 8s budgets covers getUser, the role lookup and the MFA
  // pair even when they run one after another.
  await vi.advanceTimersByTimeAsync(40_000);
  return pending;
}

describe("middleware when Supabase Auth never answers", () => {
  it("gives up on getUser instead of hanging, and says so", async () => {
    mocks.getUser.mockImplementation(neverAnswers);

    const res = await runPastTimeouts("/admin");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
    // "We could not check" — deliberately distinct from "you are signed out".
    expect(res.headers.get("location")).toContain("unavailable=1");
  });

  it("answers an API route with 503 rather than a redirect", async () => {
    mocks.getUser.mockImplementation(neverAnswers);

    const res = await runPastTimeouts("/api/admin/reservations");

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("temporarily unavailable"),
    });
  });

  it("never lets a stalled MFA check wave someone past the second factor", async () => {
    mocks.getUser.mockResolvedValue(ADMIN);
    mocks.getAal.mockImplementation(neverAnswers);
    mocks.listFactors.mockImplementation(neverAnswers);

    const res = await runPastTimeouts("/admin");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("unavailable=1");
    // Emphatically not a pass-through.
    expect(res.headers.get("location")).not.toContain("/admin/today");
  });

  it("denies rather than guesses when the role lookup stalls", async () => {
    // No role claim on the token, so the lookup is required — and it hangs.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "someone@example.com", app_metadata: {} } },
    });
    mocks.getUserById.mockImplementation(neverAnswers);

    const res = await runPastTimeouts("/admin");

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    // Denied, not resolved upward. An unread role must never become a role.
    expect(location).toContain("/admin/login");
    expect(location).toMatch(/denied=1|unavailable=1/);
  });

  it("stops after the first stalled role lookup rather than retrying into three timeouts", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-3", email: "someone@example.com", app_metadata: {} } },
    });
    mocks.getUserById.mockImplementation(neverAnswers);

    await runPastTimeouts("/admin");

    // Three unbounded retries were three ways to hang, not three chances to
    // succeed: a call that never answers will not answer on the second ask.
    expect(mocks.getUserById).toHaveBeenCalledTimes(1);
  });

  it("still admits an admin when every call answers normally", async () => {
    mocks.getUser.mockResolvedValue(ADMIN);
    mocks.getAal.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" } });
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }] } });

    const res = await proxy(request("/admin"));

    // Passes through: no redirect, no error status.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
