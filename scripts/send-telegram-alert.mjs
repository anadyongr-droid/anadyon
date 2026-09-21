#!/usr/bin/env node
/**
 * Sends a Telegram alert and fails loudly if it did not arrive.
 *
 * The workflow step this replaces could report success in two ways without
 * delivering anything:
 *
 *   [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && exit 0
 *
 * which exits 0 when the token is missing, and
 *
 *   curl -s ... > /dev/null
 *
 * which has no --fail and no check of the answer. Telegram replies HTTP 200
 * with {"ok":false,"description":"chat not found"} for a wrong chat id, so
 * curl exits 0 and the step goes green having posted nothing.
 *
 * `lib/telegram.ts` already had all of this right — its own comment names the
 * same three faults and says a 200 is not a delivery — but the fix never
 * reached the workflow. On 21 September Tasos said he had never received an
 * alert, while four failed backup runs had each reported this step as
 * successful. The step was the only thing claiming the alerting worked.
 *
 * So: token and chat id are required rather than optional, the answer is
 * checked, and a failure to deliver is a failure of the step. The token is
 * redacted from everything printed.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
const message = process.argv.slice(2).join(" ");

/** Never let the bot token reach a log; it is a bearer credential. */
const scrub = (text) => (token ? String(text).replaceAll(token, "[REDACTED_BOT_TOKEN]") : String(text));

const missing = [
  !token && "TELEGRAM_BOT_TOKEN",
  !chatId && "TELEGRAM_CHAT_ID",
  !message && "a message argument",
].filter(Boolean);

if (missing.length) {
  console.error(`Cannot send the Telegram alert — missing: ${missing.join(", ")}.`);
  console.error("Refusing to exit 0: a silent skip is what hid this for weeks.");
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);

try {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    signal: controller.signal,
  });

  const raw = await res.text().catch(() => "");
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Left null; the raw text is reported instead.
  }

  // A 200 is not a delivery. Telegram signals application-level failure in the
  // body while still answering 200.
  if (!res.ok || body?.ok !== true) {
    const reason = body?.description ?? scrub(raw).slice(0, 300) ?? `HTTP ${res.status}`;
    console.error(`Telegram did NOT deliver the alert: ${scrub(reason)}`);
    console.error(`  HTTP status: ${res.status}`);
    console.error(`  chat id used: ${chatId.length} characters, starts "${chatId.slice(0, 4)}"`);
    process.exit(1);
  }

  console.log(`Telegram accepted the alert (message_id ${body.result?.message_id ?? "unknown"}).`);
} catch (err) {
  const reason = err?.name === "AbortError" ? "no answer within 10s" : String(err);
  console.error(`Telegram did NOT deliver the alert: ${scrub(reason)}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
