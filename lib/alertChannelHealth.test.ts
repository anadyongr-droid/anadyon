import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// healthChecks imports the admin client at module load.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

import { checkAlertChannel } from "./healthChecks";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");

/** A structurally valid bot token: `<digits>:<secret>`. Not a real one. */
const VALID_TOKEN = "1234567890:AAFfakefakefakefakefakefakefake0";
const CHAT_ID = "-1009876543210";

/**
 * Every case passes its own environment object.
 *
 * Mutating the real process.env is shared state across vitest's parallel
 * workers, and doing so here failed seven unrelated tests on the first run
 * while passing in isolation.
 */
const env = (over: Record<string, string | undefined> = {}) => ({
  TELEGRAM_BOT_TOKEN: VALID_TOKEN,
  TELEGRAM_CHAT_ID: CHAT_ID,
  ...over,
}) as unknown as NodeJS.ProcessEnv;

describe("the alert channel reports its own configuration", () => {

  it("passes when both are set, and says which chat", () => {
    const r = checkAlertChannel(env());
    expect(r.ok).toBe(true);
    // The last four digits are what answer "is it the right chat?" at a glance.
    expect(r.detail).toContain("…3210");
  });

  it("never echoes the token, in whole or in part", () => {
    // The chat id is a group identifier and safe to show. The token is not, and
    // a check that leaks it into an admin screen would be worse than no check.
    const r = checkAlertChannel(env());
    expect(r.detail).not.toContain(VALID_TOKEN);
    expect(r.detail).not.toContain("AAFfake");
    expect(r.detail).not.toContain("1234567890");
  });

  it("fails loudly when the token is missing, because that means silence", () => {
    // sendTelegram returns immediately without a token: nothing sent, nothing
    // queued, nothing logged. An empty alert_outbox looks identical to health.
    const r = checkAlertChannel(env({ TELEGRAM_BOT_TOKEN: undefined }));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/TELEGRAM_BOT_TOKEN/);
    expect(r.detail).toMatch(/silent|skipped/i);
  });

  it("fails differently when only the chat id is missing", () => {
    // Messages still go out, to the hardcoded fallback group. "Delivering
    // somewhere unintended" must not read the same as "not delivering".
    const r = checkAlertChannel(env({ TELEGRAM_CHAT_ID: undefined }));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/TELEGRAM_CHAT_ID/);
    expect(r.detail).toMatch(/still sent|fallback/i);
    expect(r.detail, "must not claim alerts are skipped — they are not")
      .not.toMatch(/skipped/i);
  });

  it("catches the two variables holding each other's values", () => {
    // The failure that actually happened on 28 September. A chat id in the
    // token slot is non-empty, so a presence check passes it, and every send
    // then 404s against api.telegram.org/bot-100…/sendMessage.
    const r = checkAlertChannel(env({ TELEGRAM_BOT_TOKEN: CHAT_ID, TELEGRAM_CHAT_ID: VALID_TOKEN }));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/swapped/i);
  });

  it.each(["", "   "])("treats a whitespace-only token as missing", value => {
    expect(checkAlertChannel(env({ TELEGRAM_BOT_TOKEN: value })).ok).toBe(false);
  });
});

describe("the check is wired in and the fallback it warns about is real", () => {
  it("runHealthChecks includes it", () => {
    const src = read("lib/healthChecks.ts");
    expect(src).toMatch(/Promise\.resolve\(checkAlertChannel\(\)\)/);
  });

  it("lib/telegram.ts really does fall back to a hardcoded chat id", () => {
    // The amber case above is only correct while this holds. If the fallback
    // is ever removed, a missing chat id becomes a hard failure and the wording
    // here would be wrong — so the claim is pinned to the code it describes.
    expect(read("lib/telegram.ts")).toMatch(
      /process\.env\.TELEGRAM_CHAT_ID\s*\?\?\s*"-?\d+"/
    );
  });

  it("lib/telegram.ts really does return silently without a token", () => {
    // Likewise for the red case: the claim is that nothing is queued, and that
    // is only true while sendTelegram returns before reaching queue().
    const src = read("lib/telegram.ts");
    const fn = src.slice(src.indexOf("export async function sendTelegram"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/if \(!BOT_TOKEN\)[\s\S]{0,140}return;/);
  });
});
