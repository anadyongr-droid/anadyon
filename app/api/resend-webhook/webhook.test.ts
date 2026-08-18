import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("resend", () => ({ Resend: class { emails = { send: async () => ({}) } } }));

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/resend-webhook", { method: "POST", body, headers }) as never;

const SIGNED = { "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": "v1,AAAA" };

describe("POST /api/resend-webhook", () => {
  beforeEach(() => { vi.resetModules(); });

  it("refuses when no signing secret is configured, without claiming a server fault", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import("./route");
    const res = await POST(req("{}", SIGNED));
    expect(res.status).toBe(503);
  });

  it("rejects a request with no signature headers", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_" + btoa("secret-key-material");
    const { POST } = await import("./route");
    expect((await POST(req("{}"))).status).toBe(401);
  });

  it("rejects a forged signature as an auth failure, not a 500", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_" + btoa("secret-key-material");
    const { POST } = await import("./route");
    const res = await POST(req(JSON.stringify({ type: "email.bounced", data: {} }), SIGNED));
    expect(res.status).toBe(401);
  });

  it("rejects a malformed signing secret as an auth failure, not a 500", async () => {
    // The reported defect: a secret that is not valid base64 made atob throw,
    // and the exception escaped as HTTP 500.
    process.env.RESEND_WEBHOOK_SECRET = "whsec_!!!not-base64!!!";
    const { POST } = await import("./route");
    const res = await POST(req("{}", SIGNED));
    expect(res.status).toBe(401);
  });

  it("never reports an authentication failure as a server error", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_" + btoa("secret-key-material");
    const { POST } = await import("./route");
    for (const [body, headers] of [
      ["not json at all", SIGNED],
      ["{}", { ...SIGNED, "svix-signature": "garbage" }],
      ["", SIGNED],
    ] as const) {
      const res = await POST(req(body, headers));
      expect(res.status, `body=${body}`).toBeLessThan(500);
    }
  });
});
