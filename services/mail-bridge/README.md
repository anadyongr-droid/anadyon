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
| Idempotency, with a four-state delivery outcome so an ambiguous send is never auto-retried | **built and tested** |
| Per-user volume limits, atomic with the idempotency claim | **built and tested** |
| A real deadline on the Zoho call, and a lease so a crashed worker cannot strand a key | **built and tested** |
| Host allowlist on both credential destinations | **built and tested** |
| Kill switch, read at runtime on every send | **built and tested** |
| Check ordering (the refusals precede the send) | **built, and proved by two deliberate breaks** |
| Send / list-senders / status handlers | **built and tested** |
| Write-ahead intent record, failing closed **before** the send | **built and tested** |
| Zoho client | **built** against the published API, with the undocumented parts refused rather than guessed |
| OAuth refresh and token caching | **built**; the client id, secret and refresh token are passed in, never held here |
| HTTP transport (routing, CORS, body limits, bearer token) | **built and tested** |
| Reconciliation detector (review HIGH 2) — **comparison logic only** | **built and tested**; it has **no mailbox source, no schedule, no alert path**, so nothing runs it |
| Browser extension — the relay call, the no-fallback rule, the manifest | **built and asserted** |
| Browser extension — the Gmail DOM | **not built**, and the only remaining promise |
| A build step inlining the extension modules into `content.js` | **not built** |
| Attachment upload | **cannot be built** without widening the request type — see below |

**236 tests.** `npx vitest run services/mail-bridge/`.

**61 mutations, 0 surviving.** `node services/mail-bridge/audit/mutation-sweep.mjs`
turns each control off in turn and requires the suite to fail. See
[`audit/mutation-sweep.mjs`](audit/mutation-sweep.mjs) for why it exists.

## The order of the checks is the design

`relay.ts` runs: kill switch → authentication → validation → **admission
(volume limit and idempotency claim in one atomic step)** → **write-ahead
intent** → send → outcome. Two of those positions are
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

`INTENT_FAILURE_BLOCKS_SEND` in `store.ts` is a named constant with its
reasoning beside it: a send nobody can afterwards account for is worse than a
send that did not happen. **It is named for the write-ahead intent because that
is the only record that can block anything** — its predecessor,
`AUDIT_FAILURE_BLOCKS_SEND`, ran after the send and blocked nothing.

A thrown Zoho client yields `delivery: "unknown"` and the key is **settled, not
released**: a transport failure is not a verdict on the message, and Zoho never
received the relay's key, so an automatic retry could send the customer a second
copy. Only a request that was never attempted frees its key. An expired claim
lease is resolved the same way — `unknown`, never re-admitted.

The error string the caller receives is fixed, so no upstream text — and
therefore no token or internal hostname — can reach it, and the intent record
stores `subjectLength`, never the subject.

## The extension skeleton, and what it deliberately refuses to do

MV3. `permissions` is `["storage"]` alone; `host_permissions` is Gmail **plus
the one relay origin**, which Chrome requires for the service worker's fetch and
which a test holds to exactly two entries; the CSP is `script-src 'self'`.
[`extension/PERMISSIONS.md`](extension/PERMISSIONS.md) states why each one is
there, so a later addition has to argue against a written baseline rather than
appear in a diff.

The relay origin is a compiled-in constant, **not a setting**: a configurable
relay endpoint is an exfiltration target. The background worker checks
`sender.url` against the Gmail origin and accepts a closed set of message kinds.
`submitCorporateSend` **never falls back to Gmail's own Send** — a failure that
quietly sends through Google is the precise defect this service exists to
remove, so it surfaces the failure instead.

## What Codex's review changed, 27 October

Codex reviewed PR #242 at `c8d10ff` and returned **changes required** with ten
findings. **All ten were upheld**, including the two I expected to argue with,
and the fixes are in this directory. The three that were genuine defects rather
than gaps:

1. **An ambiguous Zoho result could send the customer two copies.** The relay
   released the idempotency key whenever a `retryable` flag was set, and the
   comment justifying it said retrying was safe *"because the relay holds an
   idempotency key"*. **Zoho never receives that key.** A timeout or a 5xx
   landing after Zoho accepted the message, retried, is a second copy. The
   outcome type now has four delivery states — `sent`, `not_attempted`,
   `rejected`, `unknown` — and **only `not_attempted` releases the key**.
   `unknown` settles it and tells a person to look in Sent. See
   [`lib/zohoClient.ts`](lib/zohoClient.ts).
2. **The "fail-closed" audit was not fail-closed.** It was written *after* the
   send, under a constant named `AUDIT_FAILURE_BLOCKS_SEND`. The message had
   already left, so an audit failure meant a send with no record of who made it
   — the exact outcome §2.2's attribution requirement exists to prevent. The
   record is now written **before** the send and a failure to write it stops the
   send. The constant is renamed `INTENT_FAILURE_BLOCKS_SEND`, because the old
   name described a true intention about code that could not deliver it.
3. **The threading capability flag was a trapdoor.** Turning it on removed the
   refusal while the request body still carried no threading field, so its only
   effect was to produce the silent unthreaded send the refusal existed to
   prevent. One of this directory's own tests asserts the body never carries a
   threading value, which should have made that obvious. **The flag is gone**
   and the refusal is unconditional.

The others: the volume limit was counted separately from the claim, so
concurrent requests with different keys all passed it — now one atomic `admit`;
`timeoutMs` was declared and never used, and a crashed worker stranded a key
forever — now a real deadline and a lease with fencing tokens; any HTTP 2xx read
as a successful send, so a captive portal's page would have told staff their
message had gone — now the relay's own `sent: true` is required; the refresh
token and client secret went to whatever host configuration named — now an
explicit Zoho host allowlist, checked on labels so `zoho.eu.evil.example`
cannot pass; `fromAddress` was sent as `Display Name <address>` where Zoho
documents a bare address, which was this file's own criticism turned on itself;
the extension lacked `host_permissions` for the relay; and the documented
environment-variable kill switch could not be immediate, because Vercel applies
variable changes only to new deployments.

Every fix has a test, and each was proved by re-breaking it in this working
copy. The detector's grace period is also bounded now: an excessive
caller-supplied value kept every send `pending` forever, and a detector whose
own configuration can silence it is not a detector.

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

## The self-audit, 27 October — five defects, and six properties nothing asserted

Run before asking for a third review, because two rounds of findings had
established that reading my own code was not catching things.

**The instrument.** [`audit/mutation-sweep.mjs`](audit/mutation-sweep.mjs)
applies 61 plausible defects one at a time and requires the suite to fail for
each. It exists because re-breaking a fix by hand proves a control is
*reachable* and says nothing about whether the assertion is right — and this
service had already shipped two tests that asserted the defect they were
written to catch. The first run left **six survivors**: six properties the code
claims and no test asserted. All six are closed.

**Five defects found by reading, the first two serious:**

1. **The status endpoint reported an unknown delivery as `200 { sent: false }`**
   — a flat statement that the message was not sent, about the one outcome that
   means *we cannot tell*. Anyone acting on it would resend. It also answered
   404 both for a key nobody had claimed and for one still in flight, so a
   person checking on a send in progress was told it did not exist. `sent` is
   now emitted only when the answer is definite, and `state` plus `guidance`
   carry the rest. **Neither review covered the status path**; both looked at
   the send path.
2. **The attachment blocklist could be stepped around four ways.**
   `evil.exe.` read as having no extension — and Windows strips a trailing dot,
   so the saved file is `evil.exe`. `evil.exe ` read as `"exe "`, and Windows
   strips trailing spaces too. `evil.exe..` the same. `evil.exe\u0000.pdf` read
   as a PDF while a C-string parser downstream sees `evil.exe`. Filenames with
   control characters or path separators are now refused outright, trailing dots
   and whitespace are stripped before splitting, and **every** extension segment
   is checked rather than the last.
3. **`a@b@c.gr` passed as one address**, in a regex whose stated job is rejecting
   what could smuggle a second recipient. Control characters in the local part
   passed too.
4. **`lookup` was dead code holding a live-looking security check.** `inspect`
   replaced every caller, so its user-scoping test was unreachable — an
   unreachable security check is worse than none, because it reads as protection
   while protecting nothing. Deleted.
5. **Two redundant guards made each other untestable.** `isZohoHost` checked the
   protocol *and* filtered the allowlist to https entries; each masked the
   other, so removing either changed no behaviour and failed no test. One gate
   now, and the credential check beside it — which is **not** redundant, because
   `url.origin` omits userinfo, so `https://user:pass@mail.zoho.eu` has a
   permitted origin.

Two stale comments were corrected as well: one claimed threading headers were
preserved, which stopped being true when the trapdoor was removed, and
`maxRecipients: 20` needed saying out loud that the client's effective limit is
1 until somebody proves otherwise.

## What this is not: a re-review found two more defects, and the honest status

Codex re-reviewed at `b71509e` and returned **changes still required**. Both
code defects are fixed here, and both were mine:

1. **An expired claim lease automatically permitted a second send.** The fix for
   review finding 7 reintroduced finding 1 through the mechanism meant to close
   it: the earlier worker may already have reached Zoho, and a fencing token is
   local, so Zoho cannot tell the second send is a duplicate. **Worse, the test
   written for it started a stalled provider call and asserted that a second
   send was admitted — a test asserting the bug**, which is the third time this
   project has recorded that. An expired claim is now settled `unknown` and
   never re-admitted.
2. **Releasing a never-attempted request removed the wrong admission from the
   volume count** — the first one belonging to that user, usually a completed
   send — so the rolling limit was undercounted in both directions at once.
   Admissions are now matched on the key and the fencing token.

**And this is not an executable bridge.** Stated as a list rather than left to
be discovered, because the previous version of this document read as more
finished than it is:

- no durable store — `InMemoryBridgeStore` loses everything on restart;
- no `Authenticator` implementation at all;
- no deployable server or framework adapter;
- the separate repository, deployment and credential boundary §6.2 requires
  does not exist;
- `content.js` has no Gmail DOM integration and no module-inlining build;
- the manifest and the worker still target **`relay.invalid`**, a deliberately
  unresolvable placeholder;
- the reconciliation detector has no schedule, no canary delivery and no alert
  path;
- controlled extension packaging and distribution do not exist.

Those are **W68**. The next safe milestone is a credential-free, separately
deployed test shell — not a credentialed pilot.

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
