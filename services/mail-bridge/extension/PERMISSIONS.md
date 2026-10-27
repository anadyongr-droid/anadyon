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

## What this permission set does NOT achieve

**It does not make the extension a security boundary**, and §2.3 of the proposal
says so explicitly. A compromised or malicious update can read everything
visible in Gmail, including tax, accountant and account-recovery mail. The
narrow permissions reduce what *else* it could do; they do not reduce that.

Mitigations that are not permissions and are **not yet built**: controlled
private distribution, signing, a review step on every update, and an inventory
of which devices carry it. Those are Stage 2 items in §13 and they are the real
control.
