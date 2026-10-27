/**
 * The relay call, with nothing injected from the page and nothing taken from
 * storage except the session token.
 *
 * **Why this is a separate module from `background.js`.** The review's finding
 * 6 is correct and worth restating: *"everything in the extension is a
 * promise, including 'never silently fall back to Gmail's native sender'"*.
 * A promise in a file that cannot be tested stays a promise. Everything here
 * takes its `fetch`, its origin and its session as arguments, so the rules
 * below are properties with tests behind them rather than intentions in a
 * comment. What remains untestable is the part that touches Gmail's DOM, and
 * that is now the only part.
 *
 * **The origin is passed in once, by the caller that knows it, and never read
 * from storage.** A configurable relay endpoint is an exfiltration target: a
 * compromised content script that could choose the destination could post the
 * composed message anywhere. `background.js` holds the one constant.
 */

/** Only these three calls exist. A message naming anything else is not a request. */
export const RELAY_CALLS = Object.freeze({
  listSenders: { method: "GET", path: "/senders" },
  submit: { method: "POST", path: "/send" },
  status: { method: "GET", path: "/status" },
});

/**
 * @param {{origin: string, fetchImpl: Function, getSession: Function}} deps
 */
export function createRelayClient({ origin, fetchImpl, getSession }) {
  if (typeof origin !== "string" || !origin.startsWith("https://")) {
    // A relay reached over plaintext would carry the session token in the
    // clear on an office network. Refused at construction rather than per
    // call, so a misconfigured build fails immediately and visibly.
    throw new Error("The relay origin must be an https origin.");
  }

  /**
   * @param {{kind: string, payload?: object, idempotencyKey?: string}} message
   */
  async function call(message) {
    const spec = RELAY_CALLS[message.kind];
    if (!spec) return { ok: false, status: 0, body: { error: "rejected message" } };

    const session = await getSession();
    if (!session) return { ok: false, status: 0, body: { error: "not signed in to the relay" } };

    let url = `${origin}${spec.path}`;
    if (message.kind === "status") {
      if (!message.idempotencyKey) return { ok: false, status: 0, body: { error: "no idempotency key" } };
      url += `?idempotencyKey=${encodeURIComponent(message.idempotencyKey)}`;
    }

    /** @type {Record<string, string>} */
    const headers = { authorization: `Bearer ${session}` };
    // Only the POST carries a body, so only the POST declares a type. A
    // content-type on a GET is noise that still costs a preflight.
    if (spec.method === "POST") headers["content-type"] = "application/json";

    let response;
    try {
      response = await fetchImpl(url, {
        method: spec.method,
        headers,
        body: spec.method === "POST" ? JSON.stringify(message.payload ?? {}) : undefined,
        // The relay authenticates by bearer token, so no cookie should ever be
        // attached — and `omit` means a signed-in Google session cannot be
        // carried to the relay by accident.
        credentials: "omit",
        // Gmail must not be able to read the relay's answer by any path other
        // than this one.
        mode: "cors",
        redirect: "error",
      });
    } catch {
      // Never pass the thrown message on: it carries the URL and sometimes the
      // headers, and this value is returned into the Gmail page.
      return { ok: false, status: 0, body: { error: "relay unreachable" } };
    }

    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    return { ok: response.ok === true, status: response.status, body };
  }

  return { call };
}
