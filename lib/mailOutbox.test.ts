/**
 * A rejected send must not look like a delivered one.
 *
 * resend.emails.send() resolves with { data, error } rather than throwing, and
 * the old sendMail returned that promise untouched. A rejected domain, a rate
 * limit and an invalid recipient all came back looking exactly like success,
 * so the booking route handed the customer a reference for an email nobody
 * ever received.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queued: Array<Record<string, unknown>> = [];
const telegrams: string[] = [];
let sendImpl: () => Promise<unknown> = async () => ({ data: { id: "1" }, error: null });

vi.mock("resend", () => ({
  Resend: class { emails = { send: () => sendImpl() }; },
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ insert: async (r: Record<string, unknown>) => { queued.push(r); return { error: null }; } }) },
}));

vi.mock("@/lib/telegram", () => ({ sendTelegram: async (m: string) => { telegrams.push(m); } }));

const mail = { from: "a@anadyon.gr", to: "guest@example.com", subject: "Quote ANA-1", html: "<p>hi</p>" };

describe("sendMail", () => {
  beforeEach(() => {
    queued.length = 0; telegrams.length = 0; vi.resetModules();
    sendImpl = async () => ({ data: { id: "1" }, error: null });
  });

  it("reports delivery only when Resend actually accepted it", async () => {
    const { sendMail } = await import("./mailer");
    const r = await sendMail(mail);
    expect(r).toEqual({ ok: true, queued: false });
    expect(queued).toHaveLength(0);
  });

  it("treats an error field as a failure, not a send", async () => {
    // The exact shape that used to pass silently.
    sendImpl = async () => ({ data: null, error: { name: "validation_error", message: "domain is not verified" } });
    const { sendMail } = await import("./mailer");
    const r = await sendMail(mail);

    expect(r.ok).toBe(false);
    expect(r.queued).toBe(true);
    expect(queued).toHaveLength(1);
    expect(String(queued[0].error)).toContain("domain is not verified");
  });

  it("tells the office at once, because a retry tomorrow is not a fix", async () => {
    sendImpl = async () => ({ data: null, error: { message: "rate limited" } });
    const { sendMail } = await import("./mailer");
    await sendMail(mail);

    expect(telegrams).toHaveLength(1);
    expect(telegrams[0]).toContain("guest@example.com");
    expect(telegrams[0]).toContain("Quote ANA-1");
  });

  it("queues the whole message so it can be retried verbatim", async () => {
    sendImpl = async () => ({ data: null, error: { message: "boom" } });
    const { sendMail } = await import("./mailer");
    await sendMail(mail);

    const stored = JSON.parse(String(queued[0].payload));
    expect(stored).toMatchObject(mail);
    expect(String(queued[0].key)).toMatch(/^email:/);
  });

  it("never throws, so a mail fault cannot fail a stored booking", async () => {
    sendImpl = async () => { throw new Error("socket hang up"); };
    const { sendMail } = await import("./mailer");
    await expect(sendMail(mail)).resolves.toMatchObject({ ok: false, queued: true });
  });
});
