# Anadyon mail bridge — relay

**Status: Stage 1 proof of concept. Nothing here is deployed, and nothing here
holds a credential.**

Implements the relay described in
[`docs/GMAIL-ZOHO-OFFICE-MAIL-PROPOSAL.md`](../../docs/GMAIL-ZOHO-OFFICE-MAIL-PROPOSAL.md)
§6.2, reviewed in
[`docs/REVIEW-GMAIL-ZOHO-BRIDGE-PROPOSAL.md`](../../docs/REVIEW-GMAIL-ZOHO-BRIDGE-PROPOSAL.md).

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
| Zoho client | **interface only**, with a fake for tests |
| OAuth flow | **not built** — needs credentials, Stage 1 with Tasos |
| HTTP endpoints | **not built** |
| Browser extension | **not built** |
| Audit store | **not built** |

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
