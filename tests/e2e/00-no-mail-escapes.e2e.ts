import { describe, it, expect } from "vitest";

/**
 * Guards the thing that actually went wrong: the suite sent real email.
 *
 * 01-quote.e2e.ts exercised the public quote route without mocking the mailer,
 * so every quote it created despatched two genuine messages — a dozen per run,
 * every run — into the owner's inbox. MAIL_REDIRECT_TO kept them away from the
 * office but still delivered them.
 *
 * setup.ts now stubs the Resend transport for every file. This asserts that
 * floor holds, so the suite cannot quietly start sending again.
 */
describe("phase 0 — no mail can escape the suite", () => {
  it("stubs the transport, so a real send is impossible", async () => {
    const { sendMail } = await import("@/lib/mailer");
    const result = await sendMail({
      from: "test@example.invalid",
      to: ["nobody@example.invalid"],
      subject: "escape probe",
      html: "<p>If this arrives in a real inbox, this test is broken.</p>",
    });
    // The stub returns this id. A real Resend response never would.
    expect((result as { data?: { id?: string } })?.data?.id).toBe("stubbed-in-tests");
  });

  it("holds no usable Resend credential", async () => {
    expect(process.env.RESEND_API_KEY).toBe("re_test_stub_not_a_real_key");
  });

  it("does not point redirected mail at any address the owner reads", async () => {
    expect(process.env.MAIL_REDIRECT_TO).toBe("blackhole@example.invalid");
    expect(process.env.MAIL_REDIRECT_TO).not.toContain("anadyon");
    expect(process.env.MAIL_REDIRECT_TO).not.toContain("maroudas");
  });
});
