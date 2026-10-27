/**
 * Adds the corporate send action to Gmail compose.
 *
 * **Stage 1: structure only.** Nothing here attaches to Gmail's real DOM,
 * because the selectors are the part that breaks when Google ships a change —
 * which is the maintenance liability the review priced and Tasos accepted. They
 * belong in Stage 2 where they can be exercised against a test account, not
 * guessed here.
 *
 * **Two rules this file exists to hold.**
 *
 * 1. **It never falls back to Gmail's own Send.** §6.1 requires that, and the
 *    review's HIGH 3 is why: a silent fallback means a customer receives a
 *    reply from `anadyon.gr@gmail.com`. On any failure the draft is preserved
 *    and the user is told to use Zoho webmail.
 * 2. **It sends only what the user explicitly sent.** No scraping of other
 *    threads, no background collection. The compose window that was submitted,
 *    once.
 */

const IDEMPOTENCY_BYTES = 16;

/** One key per user action, stable across retries of that same action. */
function newIdempotencyKey() {
  const bytes = new Uint8Array(IDEMPOTENCY_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {{senderAddress:string,to:string[],cc:string[],bcc:string[],subject:string,text?:string,html?:string,attachments:{filename:string,contentType:string,bytes:number}[],inReplyTo?:string,references?:string}} composed
 */
export async function submitCorporateSend(composed, idempotencyKey = newIdempotencyKey()) {
  const result = await chrome.runtime.sendMessage({
    kind: "submit",
    payload: { ...composed, idempotencyKey },
  });

  if (result?.ok) return { sent: true, key: idempotencyKey };

  // Never silently fall back. The draft stays where it is and the user is told
  // the one thing that always works.
  return {
    sent: false,
    key: idempotencyKey,
    message:
      result?.body?.error ??
      "Could not send through Anadyon. Your draft is kept — send from Zoho webmail instead.",
  };
}

export { newIdempotencyKey };
