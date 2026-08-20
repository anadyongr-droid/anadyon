import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyRecaptcha } from "@/lib/recaptcha";

/**
 * A CAPTCHA that says yes when it could not check is not a CAPTCHA. These
 * assertions are mostly about the failure paths, because those are the ones
 * that were previously indistinguishable from success.
 */
describe("reCAPTCHA verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown, ok = true) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })));

  it("accepts a valid token solved on the real site", async () => {
    respond({ success: true, hostname: "anadyon.gr" });
    expect(await verifyRecaptcha("tok")).toBe(true);
  });

  it("accepts a preview deployment", async () => {
    respond({ success: true, hostname: "anadyon-abc123.vercel.app" });
    expect(await verifyRecaptcha("tok")).toBe(true);
  });

  it("refuses a token solved somewhere else", async () => {
    // success:true only means the token is real — not that it came from us.
    respond({ success: true, hostname: "attacker.example" });
    expect(await verifyRecaptcha("tok")).toBe(false);
  });

  it("refuses when Google reports failure", async () => {
    respond({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verifyRecaptcha("tok")).toBe(false);
  });

  it("refuses on a non-200 from Google", async () => {
    respond({}, false);
    expect(await verifyRecaptcha("tok")).toBe(false);
  });

  it("refuses when the request throws, rather than assuming a person", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await verifyRecaptcha("tok")).toBe(false);
  });

  it("refuses an empty token without calling Google at all", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await verifyRecaptcha("")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a response with no hostname", async () => {
    respond({ success: true });
    expect(await verifyRecaptcha("tok")).toBe(false);
  });
});
