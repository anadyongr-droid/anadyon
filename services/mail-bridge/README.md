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

## Start here

- [`CONFIGURATION.md`](CONFIGURATION.md) — every variable the relay needs, names
  only, and why the template is a document rather than a `.env.example`.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — what isolation means concretely, the
  twenty-refresh-token trap, and the five things that must exist before any
  pilot and do not.
- [`extension/PERMISSIONS.md`](extension/PERMISSIONS.md) — why each permission is
  there, and what now fails a test rather than depending on a reviewer noticing.

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
| Zoho client | **built** against the published API, with the undocumented parts refused rather than guessed |
| OAuth refresh and token caching | **built**; the client id, secret and refresh token are passed in, never held here |
| HTTP transport (routing, CORS, body limits, bearer token) | **built and tested** |
| Reconciliation detector (review HIGH 2) | **built and tested** |
| Browser extension — the relay call, the no-fallback rule, the manifest | **built and asserted** |
| Browser extension — the Gmail DOM | **not built**, and the only remaining promise |
| A build step inlining the extension modules into `content.js` | **not built** |
| Attachment upload | **cannot be built** without widening the request type — see below |

**175 tests.** `npx vitest run services/mail-bridge/`.

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

## What the Zoho documentation answered, and the answers are not the convenient ones

Read 27 October from Zoho's own pages, not from memory (§8). The verified
mechanics are in the header comment of [`lib/zohoApi.ts`](lib/zohoApi.ts). Three
things it does **not** say decide the shape of the client, and each is refused
rather than guessed, because each fails in the direction the office cannot see:

- **more than one recipient per field is undocumented.** Every published sample
  passes one address and the field is described in the singular. A comma-joined
  list read as one malformed address, or as the first address only, delivers to
  fewer people than the sender believes and says nothing. Refused until somebody
  has watched a two-recipient message arrive at both.
- **there is no documented field for `In-Reply-To` or `References`.** This is a
  real answer to §17's threading question and it is *"not through this
  endpoint"*. Dropping them would send a reply that starts a new thread in the
  customer's mailbox — a customer-visible change, so not an agent's to make
  quietly under §13. Refused.
- **nothing documents whether a copy reaches Sent**, so `savedToSent` is
  reported `false` meaning *not established*, never *known absent*.

`NOTHING_PROVEN` is the default capability set and every flag in it is false, so
turning one on is a deliberate act with a name, reviewable in a diff, rather
than a comma quietly appearing in a join.

**One gap is ours rather than Zoho's.** `Attachment` carries a filename, a
content type and a byte *count* — not the bytes, because the validator never
needed them. So the upload step cannot run and a send with attachments is
refused naming that reason. Closing it widens the request type, which is a
Stage 2 change rather than a configuration.

**The host is not compiled in.** Zoho's multi-data-centre page says the token
response's `api_domain` is where API requests go, so the client reads it from
there and refuses to send if it is absent. A guessed host is a different data
centre: a 404 at best, somebody else's tenancy at worst.

## The reconciliation detector, and the rule it is built around

[`lib/reconcile.ts`](lib/reconcile.ts) answers the review's HIGH 2. Its
objection was not that Auto BCC might fail but that **verifying it once at pilot
time is the mistake this project has made five times** — an instrument that
reports success because it asked the easy question.

So: **a comparison with nothing in it is never `ok`.** It is `inconclusive`, and
`ok` requires at least one send matched on *both* sides. A failed listing is not
an empty mailbox — `Listing` is a union, so a caller cannot pass `[]` to mean
"we could not ask". Divergence outranks inconclusiveness, so a real finding is
not softened by an incomplete picture.

**The canary is what makes a quiet period checkable.** Because `ok` needs a
matched send, a week of no outbound office mail could never confirm the path.
The intended operation is one deliberate probe per run; a canary missing from
either listing is diverged outright, and the grace period does not apply to it.

**The correlation identifier is unresolved and named as such.** Zoho's
`messageId` is in the audit row but its appearance in a Sent listing is
unverified; the RFC `Message-ID` is neither accepted nor returned by the
documented API, so the relay cannot know it at send time; a header the relay
sets itself is the robust answer and is unavailable for the same reason
`In-Reply-To` is. The module takes the identifier as data. And our own privacy
decision costs the easy key: the audit row stores `subjectLength`, not the
subject, so matching by subject is deliberately impossible.

## What cannot be built without Tasos

Stage 1 in the proposal also requires: a Zoho OAuth client, a non-production
test address, proof that `ZohoMail.messages.CREATE` alone can send as an alias
and save to Sent, and proof of token revocation. All four need credentials and a
Zoho plan, so they are his. The code is written so that whatever those answers
turn out to be, only a capability flag and the client's refusals change.

Sharpened by today's reading, so the asks are specific rather than
"verify sending". With a non-production address and an OAuth client, four
observations settle the design:

1. send to **two** recipients in `toAddress` and confirm both received it;
2. send a reply and see whether the thread holds in the recipient's client —
   and if it does not, whether Zoho accepts any header field for it;
3. look in **Sent** afterwards, and record whether the copy is complete;
4. note the **`messageId`** the response returns and whether that same value
   appears in a Sent listing. That is the reconciliation key, and nothing else
   available settles it.

**One operational trap, written here because the failure appears months later
and looks like something else:** Zoho allows a user twenty refresh tokens and
silently deletes the oldest when a twenty-first is issued, *including one still
in use*. Re-authorising repeatedly while setting this up can therefore revoke
the deployment's own token with no error at the time.

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

---

**Last verified:** 27 October 2026, Claude — table and findings level with the
code at commit `a1f3082`; the Gmail DOM work and the build step are the only
parts not written.
