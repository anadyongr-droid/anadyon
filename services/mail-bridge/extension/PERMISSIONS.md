# Why each permission is here, and what is deliberately absent

§6.1 of the proposal specifies the permission set. This records the reasoning so
a future reviewer can tell a necessary permission from an accumulated one.

## Present

| Permission | Why |
|---|---|
| `host_permissions: https://mail.google.com/*` | The extension must read the compose window to collect the message. **This is the privilege that makes the review's BLOCKER 2 true** — it is also read access to the administrative mailbox, and there is no narrower form of it. |
| `permissions: ["storage"]` | Non-secret preferences and a short-lived session handle. **No Zoho token, no mailbox password, no provider API key**, per §6.1. |
| `content_security_policy` with `script-src 'self'` | Forbids remotely hosted code, per §6.1's last bullet. An extension that can fetch and run code is an extension whose review means nothing. |

## Deliberately absent

- **`<all_urls>`** — §6.1 forbids it. Gmail only.
- **`tabs`, `history`, `bookmarks`, `downloads`, `cookies`, `webRequest`** — none
  is needed to read a compose window and POST it.
- **`identity`** — the relay authenticates the office user; the extension does
  not hold an OAuth flow.
- **A `connect-src` allowance for anything but the relay origin** — the relay
  origin is the only network destination, and it is pinned in `background.js`
  rather than being configurable at runtime, so a compromised content script
  cannot repoint it.

## What is now asserted rather than promised

The review's finding 6 said it plainly: *"everything in the extension is a
promise, including 'never silently fall back to Gmail's native sender'"*. That
is still true of the DOM work, and it is no longer true of the rest.
`extension.test.ts` fails if:

- `permissions` is anything but `["storage"]`, or `host_permissions` anything
  but Gmail, or either optional-permission key appears — an optional permission
  is a prompt at runtime that nobody reviews in a diff;
- the CSP stops naming `script-src 'self'`, or the manifest stops being MV3;
- a declared script file is missing or renamed;
- the relay origin stops being an `https://` constant in `background.js`, or
  starts being read from `storage.local`/`storage.sync`;
- the session moves out of `chrome.storage.session`, which is what makes an
  office machine left locked overnight unable to send in the morning without
  someone signing in;
- **`content.js` acquires a top-level `import` or `export`.** An MV3 content
  script is not an ES module, so either keyword is a syntax error in the page
  and the action simply never appears — with nothing in the extension's own log,
  because the script never ran. The skeleton written on 26 October had `export`
  statements and would have failed exactly that way; the test parses the file as
  a classic script.
- `submitCorporateSend` reports `sent: true` for any failure shape — a 400, a
  401, a 429, a 500, a 503 or a thrown messenger. Treating a 500 as a send fails
  four tests.

The relay call itself is tested against an injected `fetch`: the bearer token
goes in the header, `credentials: "omit"` so a signed-in Google session cannot
be carried along, `redirect: "error"` so the token cannot be replayed to another
host, a content type only on the POST, and nothing from a thrown `fetch` — which
carries the URL and sometimes the headers — reaching the Gmail page.

## What this permission set does NOT achieve

**It does not make the extension a security boundary**, and §2.3 of the proposal
says so explicitly. A compromised or malicious update can read everything
visible in Gmail, including tax, accountant and account-recovery mail. The
narrow permissions reduce what *else* it could do; they do not reduce that.

Mitigations that are not permissions and are **not yet built**: controlled
private distribution, signing, a review step on every update, and an inventory
of which devices carry it. Those are Stage 2 items in §13 and they are the real
control.

---

**Last verified:** 27 October 2026, Claude — permission set unchanged since it was
argued; the assertions above added with the relay call.
