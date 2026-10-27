# Deployment and isolation

**Last verified:** 27 October 2026, Claude. **Nothing in this document has been
deployed.** It states the boundary the design requires and the one place this
branch knowingly breaks it.

## The deviation, stated first because it is the most important thing here

§6.2 of the proposal requires the relay to be **"a separate project and
credential boundary from the rental application"**, so that a compromise of it
*"must not reveal Supabase, Vercel production, Resend, Stripe, AADE or
administrative-mail credentials"*.

**This directory is inside the rental application's repository, which does not
satisfy that.** It is here because Stage 1 has no credentials, no deployment and
makes no network calls, and because sitting beside the project's test tooling is
how it gets tested at all.

**Extraction to its own repository and its own deployment is a precondition of
Stage 2, not a tidy-up afterwards.** Until then this code must not be given a
credential, because the moment it has one, the repository it lives in is the
boundary.

## What isolation means concretely, when it is extracted

| Boundary | Requirement | Why |
|---|---|---|
| **Repository** | Its own, with its own access list | A repository is a credential boundary: anyone who can push can read the secret names and add code that reads the values |
| **Deployment project** | Its own Vercel/host project | Environment variables are scoped per project; a shared project shares them |
| **Secret store** | Its own, holding only the variables in `.env.example` | The relay needs no Supabase key, no Resend key, no Stripe key, no AADE credential. If it can read one, the boundary does not exist |
| **Database** | Its own, or at minimum its own role with rights to the bridge tables alone | The idempotency and audit store is the only state it needs |
| **Observability** | Its own logs and alerts | Shared logs mean the relay's operator can read the application's |
| **Egress** | Zoho only | There is no other destination. Anything else reaching out is a finding |

**The reverse direction matters as much and is easier to forget:** the rental
application must hold **no** relay credential either. Nothing in `lib/`, `app/`
or `scripts/` should ever call the relay. `lib/boundary.test.ts` inside this
directory enforces the import direction today; after extraction the separation
is structural and the test becomes redundant.

## What the relay does not hold, by design

- **No Zoho mailbox password.** Only an OAuth refresh token scoped to
  `ZohoMail.messages.CREATE`.
- **No customer data at rest.** The audit row holds the idempotency key, the
  user id, the sender address, a recipient **count**, a subject **length**, an
  attachment count, the provider's message id and a timestamp. Not the subject,
  not the body, not the recipient addresses.
- **No session that outlives a browser restart.** The extension keeps its
  relay session in `chrome.storage.session`, so a locked office machine cannot
  send in the morning without someone signing in.

## The twenty-token trap, before you generate a refresh token

Zoho allows a user **twenty refresh tokens** and silently deletes the oldest
when a twenty-first is issued — *including one still in use*, with no error at
the time. So:

- generate the deployment's refresh token **once** and put it straight into the
  secret store;
- do experimental authorisations with a **different Zoho user**, not the office
  mailbox, so that experimenting cannot revoke production;
- if office mail stops sending months later with a token that looks valid, this
  is the first thing to check.

Revocation, when needed, is `POST {accounts_host}/oauth/v2/token/revoke`.

## The kill switch is a variable, not a code change

`RELAY_SENDING_ENABLED=false` refuses every send before authentication, before
validation, before anything. It is deliberately configuration rather than code
so that stopping the bridge does not require a deploy, a review or a working
CI. The relay tells staff to use Zoho webmail, which is always available.

## What must exist before any pilot, and does not yet

1. **The extraction above.**
2. **A durable store.** `InMemoryBridgeStore` loses every idempotency claim on
   restart, which would turn a restart during a send into a possible duplicate.
   Its replacement must provide an atomic test-and-claim; see the constraint
   written into `store.ts`.
3. **An `Authenticator` implementation.** There is none. §2.2 requires
   *"individual staff identity, MFA and attribution for every bridge send"*, and
   the interface is where that lands.
4. **The reconciliation detector on a schedule, with a canary**, or the office
   record can be quietly incomplete — the review's HIGH 2. The detector is built;
   nothing runs it.
5. **Controlled private distribution of the extension**, signing, a review step
   on every update, and an inventory of which devices carry it. The review's
   BLOCKER 2 is that the extension has read access to the administrative
   mailbox, and narrow permissions do not reduce that — distribution control is
   the only thing that does.
