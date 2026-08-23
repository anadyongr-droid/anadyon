import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { matched: true, changed: true, duplicate: false }, error: null })),
  sendMail: vi.fn(async () => ({ ok: true, queued: false })),
}));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/resend-webhook", { method: "POST", body, headers }) as never;

const SIGNED = { "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": "v1,AAAA" };

async function signed(body: string, svixId = "msg_valid") {
  const timestamp = "1700000000";
  const rawSecret = "secret-key-material";
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${btoa(rawSecret)}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(rawSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${svixId}.${timestamp}.${body}`),
  );
  return {
    "svix-id": svixId,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`,
  };
}

describe("POST /api/resend-webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpc.mockClear();
    mocks.sendMail.mockClear();
    mocks.rpc.mockResolvedValue({ data: { matched: true, changed: true, duplicate: false }, error: null });
  });

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

  it("records a delivered event against the tagged customer delivery", async () => {
    const body = JSON.stringify({
      type: "email.delivered",
      created_at: "2027-08-23T10:00:00Z",
      data: {
        email_id: "resend-email-1",
        to: ["alex@example.com"],
        tags: { delivery_id: "11111111-1111-1111-1111-111111111111" },
      },
    });
    const { POST } = await import("./route");
    const response = await POST(req(body, await signed(body)));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_booking_email_event", expect.objectContaining({
      p_delivery_id: "11111111-1111-1111-1111-111111111111",
      p_email_id: "resend-email-1",
      p_event_type: "email.delivered",
      p_recipient: "alex@example.com",
      p_svix_id: "msg_valid",
    }));
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("alerts the office once for a tracked bounce", async () => {
    const body = JSON.stringify({
      type: "email.bounced",
      created_at: "2027-08-23T10:00:00Z",
      data: {
        email_id: "resend-email-2",
        to: ["alex@example.com"],
        subject: "Quote confirmation",
        tags: { delivery_id: "11111111-1111-1111-1111-111111111111" },
        bounce: { message: "mailbox unavailable" },
      },
    });
    const { POST } = await import("./route");
    expect((await POST(req(body, await signed(body, "bounce_1")))).status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValueOnce({ data: { matched: true, changed: false, duplicate: true }, error: null });
    expect((await POST(req(body, await signed(body, "bounce_1")))).status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });
});
