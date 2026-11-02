/**
 * What happens when the user presses the corporate send button.
 *
 * **One rule, and it is the whole reason this file is separate and tested:
 * there is no path from here to Gmail's own Send.** The review's HIGH 3 is the
 * live failure — a tired person clicking the wrong button and a customer
 * receiving a reply from `anadyon.gr@gmail.com`. §6.1 requires the extension
 * to fail closed, and a failure here keeps the draft and names Zoho webmail,
 * which always works.
 *
 * **The idempotency key belongs to the user's action, not to the attempt.** A
 * retry of the same press reuses it, so a relay that already sent the message
 * answers "already sent" instead of sending a second copy. A new press gets a
 * new key, because it is a new message.
 */

const IDEMPOTENCY_BYTES = 16;

/**
 * 32 hex characters, inside the relay's 16–200 url-safe range.
 * @param {{getRandomValues: Function}} [randomSource]
 */
export function newIdempotencyKey(randomSource) {
  const source = randomSource ?? (typeof crypto !== "undefined" ? crypto : undefined);
  if (!source || typeof source.getRandomValues !== "function") {
    // No fallback to Math.random: a predictable key lets one user's press
    // collide with another's and be refused, or worse be deduplicated against.
    throw new Error("No cryptographic random source is available.");
  }
  const bytes = new Uint8Array(IDEMPOTENCY_BYTES);
  source.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const FALLBACK_MESSAGE =
  "Could not send through Anadyon. Your draft is kept — send it from Zoho webmail instead.";

export const UNRECOGNISED_MESSAGE =
  "Something answered instead of the Anadyon relay, so the message was NOT sent. Your draft is kept — send it from Zoho webmail.";

export const UNKNOWN_DELIVERY_MESSAGE =
  "The message may already have been sent. Check Zoho's Sent folder before trying again — do not resend blindly.";

/**
 * @param {object} composed the compose window's contents
 * @param {{send: Function, idempotencyKey?: string}} deps
 */
export async function submitCorporateSend(composed, { send, idempotencyKey }) {
  const key = idempotencyKey ?? newIdempotencyKey();

  let result;
  try {
    result = await send({ kind: "submit", payload: { ...composed, idempotencyKey: key } });
  } catch {
    // A thrown messenger is a failure like any other. It must not become a
    // fallthrough to Gmail's sender, and it must not surface the exception.
    return { sent: false, key, retryable: true, message: FALLBACK_MESSAGE };
  }

  // `ok` already requires the relay's own `sent: true` — see relayClient.js and
  // review finding 4. This layer must not relax that, so it checks both.
  if (result && result.ok === true && result.body?.sent === true) {
    return {
      sent: true,
      key,
      deduplicated: result.body?.deduplicated === true,
      providerMessageId: result.body?.providerMessageId,
    };
  }

  // The relay answered 2xx with something that is not its own response. Do not
  // call that a send, and do not invite a retry that might duplicate: whatever
  // is between the extension and the relay has to be fixed first.
  if (result && result.unrecognised === true) {
    return { sent: false, key, retryable: false, message: UNRECOGNISED_MESSAGE };
  }

  // An ambiguous delivery must never be retried automatically. The relay says
  // so explicitly, and a person checks Sent — review finding 1.
  if (result && result.body?.delivery === "unknown") {
    return { sent: false, key, retryable: false, message: UNKNOWN_DELIVERY_MESSAGE };
  }

  // 409 means another attempt on this key is in flight; retrying is correct and
  // safe, because the key is the same one. 502 is retryable only when the relay
  // has told us the request was never made — otherwise it is handled above.
  const retryable = result?.status === 409 || result?.body?.retryable === true || result?.status === 0;

  return {
    sent: false,
    key,
    retryable,
    // The relay's own refusals are worth showing — they say which rule was
    // broken, e.g. that this sender is not approved. Anything else, including a
    // 500, gets the fixed message.
    message: typeof result?.body?.error === "string" ? result.body.error : FALLBACK_MESSAGE,
  };
}
