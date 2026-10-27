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

# Only after a reply has been confirmed to thread in the recipient's client.
# Zoho's published API documents no In-Reply-To or References field at all, so
# the likely correct value for this is permanently false.
ZOHO_CAP_THREADING_HEADERS=

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

# The kill switch, read on EVERY send before anything else happens. Set to
# exactly "false" to refuse every send and tell staff to use Zoho webmail.
# It is a variable rather than a code change so that stopping the bridge does
# not require a deploy.
RELAY_SENDING_ENABLED=

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
