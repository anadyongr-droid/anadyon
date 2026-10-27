/**
 * The only component that talks to the relay.
 *
 * **Why the relay origin is a constant here and not configurable.** A content
 * script runs in the Gmail page and is the part most exposed to a hostile
 * page or a compromised dependency. If it could choose the destination, a
 * compromise would be able to post the composed message anywhere. It cannot:
 * it asks this worker to send, and this worker knows the one address.
 *
 * **Stage 1 scope.** No real endpoint is configured, there is no session
 * handling, and nothing here has run against Gmail. This is the structure the
 * Stage 2 pilot fills in, written now so the boundaries are decided before the
 * convenient shortcuts suggest themselves.
 */

// Set at build time for each environment. Deliberately not read from storage:
// see above.
const RELAY_ORIGIN = "https://relay.invalid";

/** Messages the content script may send. Anything else is ignored. */
const ALLOWED = new Set(["listSenders", "submit", "status"]);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our own content script, only on Gmail. A message from anywhere else
  // is not a request, it is an attempt.
  if (!sender.url || !sender.url.startsWith("https://mail.google.com/")) {
    respond({ ok: false, error: "rejected origin" });
    return false;
  }
  if (!message || !ALLOWED.has(message.kind)) {
    respond({ ok: false, error: "rejected message" });
    return false;
  }

  call(message).then(respond, () => respond({ ok: false, error: "relay unreachable" }));
  return true; // async
});

async function call(message) {
  const session = await currentSession();
  if (!session) return { ok: false, error: "not signed in to the relay" };

  const path =
    message.kind === "listSenders" ? "/senders" : message.kind === "submit" ? "/send" : "/status";

  const response = await fetch(`${RELAY_ORIGIN}${path}`, {
    method: message.kind === "listSenders" || message.kind === "status" ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${session}`,
      "content-type": "application/json",
    },
    // The content script supplies the message. It does NOT supply the sender's
    // display name or the envelope — the relay generates those server-side,
    // which is why there is nothing to forge here.
    body: message.kind === "submit" ? JSON.stringify(message.payload) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function currentSession() {
  const { relaySession } = await chrome.storage.session.get("relaySession");
  return relaySession ?? null;
}
