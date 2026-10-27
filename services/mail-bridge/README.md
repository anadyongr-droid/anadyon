# Anadyon mail bridge — relay

**Status: Stage 1 proof of concept. Nothing here is deployed, and nothing here
holds a credential.**

Implements the relay described in §6.2 of `docs/GMAIL-ZOHO-OFFICE-MAIL-PROPOSAL.md`,
reviewed in
[`docs/REVIEW-GMAIL-ZOHO-BRIDGE-PROPOSAL.md`](../../docs/REVIEW-GMAIL-ZOHO-BRIDGE-PROPOSAL.md).

**The proposal itself is not on this branch.** It is Codex's, on
`codex/gmail-zoho-office-mail-proposal-20261026` (**PR #241, unmerged** — the
review's verdict was *revise and re-review*), so the path above does not resolve
here and a link to it would be broken. The review document quotes every clause
this code is built against, so it is the one to read from this branch. Corrected
27 October 2026, the link having been written on 26 October as though the
proposal had merged.

## It lives here temporarily, and that is a known deviation

§6.2 requires the relay to be *"a separate project and credential boundary from
the rental application"*, so that a compromise *"must not reveal Supabase,
Vercel production, Resend, Stripe, AADE or administrative-mail credentials"*.

**This directory is inside the rental application's repository, which does not
satisfy that.** It is here because Stage 1 is a proof of concept with no
credentials, no deployment and no network calls, and because keeping it beside
the project's test tooling is how it gets tested at all. **Before Stage 2 it must
be extracted to its own repository and its own deployment**, with its own secret
store. That extraction is a precondition of the staging pilot, not a tidy-up
afterwards.

Nothing in this directory may import from `lib/`, `app/` or `scripts/`. A test
enforces that.

## What is built

| Piece | State |
|---|---|
| Send-request validation, normalisation and limits | **built and tested** |
| Server-side sender enforcement | **built and tested** |
| Idempotency | **built and tested** |
| Per-user volume limits | **built and tested** |
| Kill switch | **built and tested** |
| Check ordering (the refusals precede the send) | **built, and proved by two deliberate breaks** |
| Send / list-senders / status handlers | **built and tested** |
| Audit store, failing closed | **built and tested** |
| Zoho client | **interface only**, with a fake for tests |
| OAuth flow | **not built** — needs credentials, Stage 1 with Tasos |
| HTTP transport (the framework binding around the handlers) | **not built** |
| Browser extension | **skeleton only** — manifest, permissions, worker, content script; no relay call |
| Reconciliation detector (review HIGH 2) | **not built** |

**62 tests.** `npx vitest run services/mail-bridge/`.

## The order of the checks is the design

`relay.ts` runs: kill switch → authentication → validation → rate limit →
idempotency claim → send → audit → settle. Two of those positions are
load-bearing rather than tidy, and each has a test that fails when the control
is moved rather than removed:

- **the kill switch precedes authentication**, because a switch checked after it
  cannot stop an attacker holding a valid session — which is the case it exists
  for. Moved to after the send, `refuses, and NOTHING was sent` fails with
  `expected [ { sender: ... } ] to deeply equal []`;
- **the rate limit precedes the idempotency claim**, so a refused request does
  not spend a key and leave the user's retry answered `already settled` instead
  of with the real reason. Moved to after the claim, `does not consume the
  idempotency key when refusing` fails with `expected 409 to be 200`.

Both breaks were applied and reverted in the working copy that ships this code,
not only in the one that first wrote the tests.

`AUDIT_FAILURE_BLOCKS_SEND` in `store.ts` is a named constant with its reasoning
beside it: a send nobody can afterwards account for is worse than a send that
did not happen. A thrown Zoho client **releases** the key rather than settling
it, because a transport failure is not a verdict on the message. The error
string the caller receives is fixed, so no upstream text — and therefore no
token or internal hostname — can reach it, and the audit row stores
`subjectLength`, never the subject.

## The extension skeleton, and what it deliberately refuses to do

MV3. `permissions` is `["storage"]` alone; `host_permissions` is
`https://mail.google.com/*` alone; the CSP is `script-src 'self'`.
[`extension/PERMISSIONS.md`](extension/PERMISSIONS.md) states why each one is
there, so a later addition has to argue against a written baseline rather than
appear in a diff.

The relay origin is a compiled-in constant, **not a setting**: a configurable
relay endpoint is an exfiltration target. The background worker checks
`sender.url` against the Gmail origin and accepts a closed set of message kinds.
`submitCorporateSend` **never falls back to Gmail's own Send** — a failure that
quietly sends through Google is the precise defect this service exists to
remove, so it surfaces the failure instead.

## What cannot be built without Tasos

Stage 1 in the proposal also requires: a Zoho OAuth client, a non-production
test address, proof that `ZohoMail.messages.CREATE` alone can send as an alias
and save to Sent, and proof of token revocation. All four need credentials and a
Zoho plan, so they are his. The interface here is written so that whatever those
answers turn out to be, only the client implementation changes.

## The review findings this code is built around

- **HIGH 2 — Auto BCC can fail silently.** Not this module's job, but the
  reconciliation detector it implies is a separate deliverable and is **not yet
  built**. Recorded so it is not forgotten: without it, an incomplete office
  record is undetectable.
- **HIGH 3 — the wrong-identity failure.** The relay refuses any request whose
  sender is not allowlisted, and never infers a sender. A request that omits the
  sender is rejected rather than defaulted, because defaulting is how a message
  leaves as the wrong identity.
- **BLOCKER 2 — the extension reads administrative mail.** Nothing in the relay
  can mitigate that. It remains true of the design.
