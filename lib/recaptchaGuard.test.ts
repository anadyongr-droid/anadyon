import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECAPTCHA_TEST_SECRET_KEY } from "./recaptchaKeys";

/**
 * The guard that stops Google's test secret working on the live site.
 *
 * A Preview-scoped variable copied into Production by accident is an entirely
 * plausible mistake, and its failure mode is silent: every submission would
 * verify, the forms would look normal, and nothing would say the protection
 * had gone. So it is refused in code rather than trusted to configuration.
 */
const { verifyRecaptcha } = await import("./recaptcha");

const ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const googleSays = (body: Record<string, unknown>) =>
  fetchMock.mockResolvedValue({ ok: true, json: async () => body });

describe("the test secret on the live site", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
    process.env.RECAPTCHA_SECRET_KEY = RECAPTCHA_TEST_SECRET_KEY;
  });

  it("refuses every submission", async () => {
    const refused = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(verifyRecaptcha("any-token")).resolves.toBe(false);
    expect(refused).toHaveBeenCalledWith(expect.stringContaining("REFUSING ALL SUBMISSIONS"));
  });

  it("does not even ask Google", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyRecaptcha("any-token");
    // Returns before the request, so a misconfiguration cannot be masked by
    // Google cheerfully verifying the token.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the test secret on a preview deployment", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.RECAPTCHA_SECRET_KEY = RECAPTCHA_TEST_SECRET_KEY;
  });

  it("accepts a token reported against Google's test host", async () => {
    // The real hostname check cannot apply: no domain of ours issued it.
    googleSays({ success: true, hostname: "testkey.google.com" });
    await expect(verifyRecaptcha("test-token")).resolves.toBe(true);
  });

  it("still rejects a token Google says is invalid", async () => {
    // The test key passes everything, so a failure here is a real one.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    googleSays({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(verifyRecaptcha("bad-token")).resolves.toBe(false);
  });
});

describe("a real secret is unaffected", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
    process.env.RECAPTCHA_SECRET_KEY = "a-real-secret";
  });

  it("accepts a token solved on the live domain", async () => {
    googleSays({ success: true, hostname: "anadyon.gr" });
    await expect(verifyRecaptcha("real-token")).resolves.toBe(true);
  });

  it("rejects one solved somewhere else", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    googleSays({ success: true, hostname: "somebody-elses-site.com" });
    await expect(verifyRecaptcha("stolen-token")).resolves.toBe(false);
  });

  it("rejects Google's test host, which a real key can never legitimately report", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    googleSays({ success: true, hostname: "testkey.google.com" });
    await expect(verifyRecaptcha("odd-token")).resolves.toBe(false);
  });

  it("still refuses an empty token without asking Google", async () => {
    await expect(verifyRecaptcha("")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
