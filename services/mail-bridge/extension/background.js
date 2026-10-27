/**
 * The only component that talks to the relay. Thin on purpose: every decision
 * it makes is in `relayClient.js`, which has tests.
 *
 * **Why the relay origin is a constant here and not configurable.** A content
 * script runs in the Gmail page and is the part most exposed to a hostile page
 * or a compromised dependency. If it could choose the destination, a
 * compromise could post the composed message anywhere. It cannot: it asks this
 * worker to send, and this worker knows the one address.
 *
 * **Stage 2 fills in two things and nothing else:** `RELAY_ORIGIN` per
 * environment, and how `relaySession` comes to be in session storage. The
 * session is deliberately in `chrome.storage.session` rather than `local`, so
 * it does not survive a browser restart and an office machine left locked
 * overnight cannot send in the morning without someone signing in.
 */

import { createRelayClient } from "./relayClient.js";

// Set at build time for each environment. Deliberately not read from storage:
// see above.
const RELAY_ORIGIN = "https://relay.invalid";

const client = createRelayClient({
  origin: RELAY_ORIGIN,
  fetchImpl: (...args) => fetch(...args),
  getSession: async () => {
    const { relaySession } = await chrome.storage.session.get("relaySession");
    return relaySession ?? null;
  },
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our own content script, only on Gmail. A message from anywhere else
  // is not a request, it is an attempt. `startsWith` on the origin plus the
  // slash, so `https://mail.google.com.evil.example/` does not match.
  if (!sender.url || !sender.url.startsWith("https://mail.google.com/")) {
    respond({ ok: false, status: 0, body: { error: "rejected origin" } });
    return false;
  }

  client.call(message ?? {}).then(respond, () =>
    // The client already catches its own failures; this is the last resort and
    // still says nothing about the cause.
    respond({ ok: false, status: 0, body: { error: "relay unreachable" } }),
  );
  return true; // async
});
