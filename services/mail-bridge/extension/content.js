/*
 * Adds the corporate send action to Gmail compose.
 *
 * **This file is a classic script and must stay one.** MV3 content scripts
 * declared in `content_scripts` are not ES modules: a top-level `import` or
 * `export` here is a syntax error in the page, and the action simply never
 * appears — with nothing in the extension's own log, because the script never
 * ran. The skeleton written on 26 October had `export` statements and would
 * have failed exactly that way. `manifest.test.ts` now fails if either keyword
 * comes back.
 *
 * So the tested logic lives in `corporateSend.js` and `relayClient.js`, and a
 * Stage 2 build step inlines them here. This file holds only the glue that
 * cannot be tested without Gmail anyway.
 *
 * **Stage 1: no selectors.** Nothing here attaches to Gmail's real DOM. The
 * selectors are the part that breaks when Google ships a change — the
 * maintenance liability the review priced — so they belong in Stage 2 where
 * they can be exercised against a test account rather than guessed here.
 *
 * **Two rules this file exists to hold.**
 *
 * 1. **It never falls back to Gmail's own Send.** On any failure the draft is
 *    preserved and the user is told to use Zoho webmail. `corporateSend.js`
 *    enforces it and its tests prove it; this file must not add a path around
 *    it.
 * 2. **It sends only what the user explicitly sent.** No scraping of other
 *    threads, no background collection. The compose window that was submitted,
 *    once.
 */

/* global chrome */
(() => {
  "use strict";

  // Replaced at build time by the inlined module. Named rather than inlined
  // here so the seam is obvious and a half-done build fails loudly.
  const submitCorporateSend = globalThis.__anadyonSubmitCorporateSend;

  /** The one messenger. Everything reaches the relay through the worker. */
  const send = (message) => chrome.runtime.sendMessage(message);

  async function onCorporateSendClicked(composed, idempotencyKey) {
    if (typeof submitCorporateSend !== "function") {
      // A build that did not inline the module must not look like a send
      // failure the user can retry past.
      return { sent: false, message: "The Anadyon send action is not installed correctly." };
    }
    return submitCorporateSend(composed, { send, idempotencyKey });
  }

  globalThis.__anadyonOnCorporateSendClicked = onCorporateSendClicked;
})();
