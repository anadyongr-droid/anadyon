/**
 * The alert path used to report success for several distinct failures, and
 * these are the ones that actually happened or plausibly would.
 *
 * The case worth stating: Telegram answers HTTP 200 with {"ok": false} for an
 * application-level refusal — a wrong chat id, a bot removed from the group.
 * The old code awaited the fetch and looked no further, so the single most
 * likely misconfiguration in this system was indistinguishable from a
 * delivered alert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Telegram delivery", () => {
  beforeEach(() => {
    inserted.length = 0;
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("treats a 200 carrying ok:false as undelivered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ ok: false, description: "chat not found" })));
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("deposit received");

    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload).toBe("deposit received");
    expect(String(inserted[0].error)).toContain("chat not found");
  });

  it("queues on an HTTP error rather than reporting success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ description: "Unauthorized" }, 401)));
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("booking failed");

    expect(inserted).toHaveLength(1);
    expect(String(inserted[0].error)).toContain("401");
  });

  it("queues when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("watchdog");

    expect(inserted).toHaveLength(1);
    expect(String(inserted[0].error)).toContain("ECONNREFUSED");
  });

  it("queues nothing when the message actually goes out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ ok: true, result: {} })));
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("all well");

    expect(inserted).toHaveLength(0);
  });

  it("keys queued rows under the tg: prefix", async () => {
    // alert_outbox is shared with the Stripe idempotency ledger, the briefing
    // marker and the watchdog. Those rows sit with sent_at null too, so the
    // prefix is the only thing stopping the drain from posting a Stripe event
    // id to the staff channel as though it were an alert.
    vi.stubGlobal("fetch", vi.fn(async () => ok({ ok: false, description: "nope" })));
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("x");

    expect(String(inserted[0].key)).toMatch(/^tg:/);
  });

  it("does not attempt delivery with no bot token configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { sendTelegram } = await import("./telegram");
    await sendTelegram("x");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
