# Configuration

**Last verified:** 27 October 2026, Claude. **Nothing here has been deployed and
no value in this project has been set.**

## Why this is a document and not a `.env.example`

The repository's `.gitignore` carries `.env*`, and that line is the project's one
real secret boundary — `.claude/settings.json` also denies agents `Read(./.env*)`
for the same reason, and `docs/HANDOFF-H1.md` §7 states it plainly: *"Never
commit `.env.local`. It holds live secrets."*

A committed `.env.example` would have to be force-added past that rule, and the
precedent is worse than the convenience: the next file force-added past it will
be the one with a value in it. It would also sit on disk one filename away from
the real file, which is how a value ends up in the wrong one.

So the template is Markdown. **Copy the block below into the relay's own secret
store** — not into this repository, and not into the rental application's
project. Per §6.2 none of these variables may be added to the rental
application's Vercel project or its `.env.local`; the relay gets its own. See
[`DEPLOYMENT.md`](DEPLOYMENT.md).

```dotenv
# Anadyon mail bridge — relay configuration template
#
# NAMES ONLY. This file carries no values and must never carry one: it is
# committed, and the repository is public. Every variable below is a secret or
# an environment fact, and both belong in the deployment's own secret store.
#
# §6.2 of the proposal requires the relay to be "a separate project and
# credential boundary from the rental application", so NONE of these may be
# added to the rental application's Vercel project or to its .env.local. The
# relay gets its own project and its own store. See DEPLOYMENT.md.
#
# Copy to .env.local in the relay's own deployment — never in this repository.

# ---------------------------------------------------------------------------
# Zoho
# ---------------------------------------------------------------------------

# The numeric account id from Zoho's "Get All User Accounts" call
# (GET {api_domain}/api/accounts). Not the mailbox address.
ZOHO_ACCOUNT_ID=

# The OAuth client, created in Zoho's API console for the EU data centre.
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=

# Obtained once with access_type=offline. See the twenty-token trap in
# DEPLOYMENT.md before generating this more than once.
ZOHO_REFRESH_TOKEN=

# Accounts host for the data centre the mailbox lives in. For Anadyon this is
# the EU one, since the MX records are mx*.zoho.eu:
#   https://accounts.zoho.eu
# Checked against an EXACT origin allowlist before the client secret and
# refresh token reach a request body. The permitted origins are
# ZOHO_ALLOWED_ORIGINS in lib/zohoApi.ts: accounts.zoho.eu, mail.zoho.eu,
# www.zohoapis.eu, api.zoho.eu. Anything else is refused, including other Zoho
# data centres — moving data centre is a deliberate code change, not something
# the allowlist already quietly permits.
# The API host is NOT configured here on purpose — the client reads api_domain
# from the token response, per Zoho's multi-data-centre guidance, and refuses
# to send if it is absent rather than guessing a data centre.
ZOHO_ACCOUNTS_HOST=

# ---------------------------------------------------------------------------
# What this deployment has PROVED Zoho does — not what it hopes
# ---------------------------------------------------------------------------
#
# Each of these is false unless set to exactly "true", and each should only be
# turned on by someone who has watched the behaviour. Every one of them fails
# silently in the customer's direction if assumed. See README.md.

# Only after a two-recipient message has been confirmed to arrive at BOTH
# addresses. Zoho documents one address per recipient field.
ZOHO_CAP_MULTIPLE_RECIPIENTS=

# NOTE: there is deliberately NO ZOHO_CAP_THREADING_HEADERS variable. The flag
# it configured was removed as a trapdoor (review finding 5): no request shape
# sat behind it, so enabling it could only turn a visible refusal into a silent
# unthreaded send. A reply carrying In-Reply-To or References is refused
# unconditionally. This note is here because the variable WAS listed, and a
# stale variable in a template is a setting somebody will try to use.

# Has no effect yet: attachment CONTENT is not carried in a send request, so
# the upload step cannot run whatever this says. Present so the variable set
# does not change when that is fixed.
ZOHO_CAP_ATTACHMENTS=

# ---------------------------------------------------------------------------
# Relay
# ---------------------------------------------------------------------------

# Comma-separated exact origins permitted to call, e.g.
#   chrome-extension://<the packed extension id>
# Empty means no cross-origin caller is permitted, which is the correct value
# until an extension id exists. There is no wildcard and no prefix matching.
RELAY_ALLOWED_ORIGINS=

# The identities the relay may send as, as address:displayName pairs. Read
# server-side and NEVER taken from a request — a request naming an address that
# is not here is refused, never defaulted. Example shape, not a value:
#   customerservice@anadyon.gr:Anadyon Customer Service
RELAY_APPROVED_SENDERS=

# Per-user volume limits. Omit to use the defaults in sendRequest.ts, which are
# 60 sends per rolling hour, 20 recipients, 20MB of attachments, 25MB total.
RELAY_MAX_SENDS_PER_WINDOW=
RELAY_WINDOW_MS=

# NOTE: there is deliberately NO RELAY_SENDING_ENABLED variable. See "The kill
# switch is not an environment variable" below — review finding 10.

# ---------------------------------------------------------------------------
# Store and authentication — NOT IMPLEMENTED, named so the gap is visible
# ---------------------------------------------------------------------------
#
# Stage 1 ships InMemoryBridgeStore, which loses everything on restart, and no
# Authenticator implementation at all. Both are Stage 2, and the store must
# provide an atomic test-and-claim — see store.ts. Listed here so a reader can
# see what is missing rather than inferring it from an absence.

# BRIDGE_DATABASE_URL=
# BRIDGE_AUTH_ISSUER=
# BRIDGE_AUTH_AUDIENCE=
```

## The kill switch is not an environment variable — review finding 10

An earlier version of this file listed `RELAY_SENDING_ENABLED`, describing it as
*"a variable rather than a code change so that stopping the bridge does not
require a deploy"*. That was wrong on its own terms, and Codex's review caught
it. Vercel's documentation says it in one sentence:

> Any change you make to environment variables are not applied to previous
> deployments, they only apply to new deployments.

So flipping an environment variable **requires a redeploy to take effect** —
which is the opposite of an immediate stop, and a redeploy is exactly what you
cannot rely on at the moment you need to stop sending: it needs a green build,
and it takes minutes you may not have.

**The kill switch is therefore durable configuration read at runtime**, which is
what `BridgeStore.isSendingEnabled()` already was. The relay calls it on every
send, before authentication and before anything else, so turning it off takes
effect on the next request with no deploy. Stage 2 must back it with the same
store as the idempotency claims, with one row an operator can set, and that read
must not be cached for longer than a send takes.

The code was right; this document was wrong. Worth stating that way round,
because the fix is a documentation change and it would have been easy to
"correct" the code towards the broken description.

## The relay host also appears in the extension

`host_permissions` in `extension/manifest.json` must name the same origin the
service worker is compiled with, or the fetch is an ordinary cross-origin
request that works only while the relay's CORS headers are right — review
finding 3, and Chrome's own documentation. `extension.test.ts` fails if the two
disagree, so changing the relay origin means changing both.
