# Proposal: keep Gmail as the office view while Zoho isolates reservation access

**Status:** architecture proposal for independent review; no implementation or production configuration has been performed  
**Written:** 26 October 2026, Codex  
**Decision owner:** Tasos  
**Requested reviewer:** Claude  
**Implementation role after approval:** to be assigned explicitly under `AGENTS.md`  
**Related:** [EMAIL-DELIVERABILITY.md](EMAIL-DELIVERABILITY.md), [OPEN-ITEMS.md](OPEN-ITEMS.md)

## 1. Decision sought

Anadyon needs to preserve the existing `anadyon.gr@gmail.com` account as the
office's main interface. Years of administrative correspondence, labels,
contacts and working habits already live there. At the same time, a remote
employee must be able to read and answer reservation email without gaining
access to tax, accountant, supplier, account-recovery or other administrative
messages.

Google has announced that, from January 2027, consumer Gmail will remove
third-party "Send as" addresses. Provider-side forwarding into Gmail remains
available, but Gmail web will no longer send through a Zoho-hosted
`@anadyon.gr` identity.

This proposal asks whether Anadyon should:

1. keep Zoho as the authoritative reservation mailbox;
2. mirror reservation correspondence into the existing Gmail account for
   office visibility;
3. let the remote employee work only in Zoho;
4. build a small, privately controlled outbound bridge so office users can keep
   replying from the Gmail web interface as an `@anadyon.gr` address after
   January 2027; and
5. keep Zoho webmail as the fallback whenever the bridge is unavailable.

Approval of the design would authorize a staging pilot only. Enabling real
corporate sender addresses, forwarding, automatic BCC, DNS changes or a
production relay requires Tasos's explicit approval of the concrete
configuration.

## 2. Requirements

### 2.1 Required behavior

- Preserve `anadyon.gr@gmail.com`, its history and its existing administrative
  workflow.
- Give office users one Gmail web view containing:
  - administrative Gmail messages;
  - incoming reservation messages; and
  - copies of reservation replies sent by the remote employee.
- Give the remote employee access only to operational reservation
  correspondence.
- Send reservation replies as an approved Anadyon address, never as the
  underlying Gmail address.
- Keep `admin@anadyon.gr`, the Gmail account and administrative messages out
  of the remote employee's account.
- Keep the booking application's Resend path independent and unchanged.
- Preserve a usable record of outgoing reservation messages in both the Zoho
  operational mailbox and the Gmail office view.
- Continue operating if the custom bridge fails by falling back to Zoho
  webmail.
- Provide a fast, tested kill switch for the bridge's sending authorization.
- Maintain an auditable record of who sent each message without retaining
  message bodies in application logs.

### 2.2 Security requirements

- No Zoho mailbox password in the extension or browser storage.
- No Gmail password anywhere in the bridge.
- No permission to read, modify or delete `admin@anadyon.gr`.
- No permission for the relay to read or delete Zoho messages.
- No unrestricted SMTP relay.
- No user-controlled `From` header.
- Individual staff identity, MFA and attribution for every bridge send.
- Only approved sender identities may be used.
- Rate limits, anomaly alerts, attachment limits and a revocation procedure.
- The extension may communicate only with Gmail and the Anadyon relay.
- The relay must not log bodies, attachments, OAuth tokens or authorization
  headers.
- The relay must be isolated from the rental application and its production
  credentials.

### 2.3 Non-goals

- Replacing Gmail as the administrative system of record.
- Building a complete webmail client.
- Synchronizing every Gmail and Zoho state, including read/unread, stars,
  folders, drafts and deletions.
- Giving the remote employee access to administrative messages.
- Replacing Resend for booking-system transactional mail.
- Providing marketing campaigns or bulk mail.
- Removing Zoho webmail.
- Treating a browser extension as a security boundary.
- Building before the design and threat model have been independently reviewed.

## 3. Existing and intended identities

| Identity | Purpose | Who may access it |
|---|---|---|
| `anadyon.gr@gmail.com` | Existing office administration and the consolidated office view | Approved office users only |
| `admin@anadyon.gr` | Zoho administration, suppliers, tax/accounting and account recovery where required | Tasos and specifically approved office administrators |
| `customersupport@anadyon.gr` | Reservation mailbox and principal operational sender | Remote reservation employee and approved office users |
| `jobs@anadyon.gr` | Alias routed to the operational mailbox | Same as the operational mailbox |
| `rentals@anadyon.gr` | Alias routed to the operational mailbox | Same as the operational mailbox |
| Resend sender | Automated booking-system messages | Application only |

The final address names must be checked against the actual Zoho configuration.
This document uses `customersupport@` consistently; older project documents
also refer to `customerservice@`, so alias ownership and the canonical sender
must be resolved before implementation.

## 4. Proposed operating model

### 4.1 Incoming reservation mail

Zoho remains the MX destination and authoritative mailbox for operational
addresses. Zoho keeps the original message and automatically forwards a copy to
`anadyon.gr@gmail.com`.

Gmail applies a dedicated label such as `Reservations / Zoho`. Office users
continue working in their familiar Gmail account. The remote employee sees the
original message only in Zoho.

Provider-side forwarding is independent of Gmail's removed POP and "Send as"
features. Zoho documents forwarding with retention of the original copy:

- https://www.zoho.com/mail/help/email-forwarding.html
- https://support.google.com/mail/answer/17101213

### 4.2 Replies sent by the remote employee

The remote employee replies in Zoho webmail. A Zoho outgoing filter
automatically BCCs `anadyon.gr@gmail.com` on messages from the operational
mailbox. The office therefore receives a copy of the remote employee's response
without the employee having access to Gmail.

Zoho documents Auto BCC as an outgoing-filter action:

- https://www.zoho.com/mail/help/outgoing-filters.html

This behavior must be verified on Anadyon's paid plan and from Zoho webmail.
Zoho states that Auto CC/BCC outgoing-filter actions do not apply to mail sent
from external IMAP/POP clients. The remote workflow must therefore use Zoho
webmail or another path whose BCC behavior is independently proven.

### 4.3 Replies sent by office users before January 2027

The current Gmail "Send as" feature may continue during Google's transition
period. It should not be treated as durable and should not be the only tested
path once a pilot exists.

### 4.4 Replies sent by office users after January 2027

A private Anadyon Chrome extension adds an explicit corporate sender selector
and a separate action such as **Send through Anadyon** to Gmail compose.

The extension sends the composed message to an isolated Anadyon relay over
HTTPS. The relay authenticates the employee, replaces any client-supplied sender
with an allowlisted server-side sender, validates the request and calls the
Zoho Mail API using an OAuth token restricted to message creation.

Zoho documents the send endpoint and the
`ZohoMail.messages.CREATE` scope:

- https://www.zoho.com/mail/help/api/post-send-an-email.html
- https://www.zoho.com/mail/help/api/using-oauth-2.html

Ordinary administrative messages continue to use Gmail's native Send button.
The extension must make the selected path obvious and must fail closed when a
corporate sender is selected.

## 5. Data-flow diagrams

### 5.1 Incoming and remote reply

```text
Customer
   |
   v
Zoho operational mailbox ----------------------+
   |                                            |
   | retained original                          | provider-side forward
   v                                            v
Remote employee                              Office Gmail
   |                                            ^
   | reply in Zoho webmail                      |
   +---- Zoho outgoing Auto BCC ----------------+
```

### 5.2 Office reply after January 2027

```text
Office user in Gmail
   |
   | chooses approved @anadyon.gr sender
   v
Private Anadyon extension
   |
   | short-lived authenticated request
   v
Anadyon mail relay
   |
   | send-only Zoho OAuth
   v
Zoho Mail API
   |
   +------> customer
   |
   +------> Zoho Sent record (must be verified)
   |
   +------> office Gmail archive/thread copy
```

## 6. Component design

### 6.1 Browser extension

The extension is a narrow user interface and request client. It must not hold a
Zoho refresh token, mailbox password, Gmail password or unrestricted provider
API key.

Proposed permissions:

- host access limited to `https://mail.google.com/*`;
- network access limited to the exact relay origin;
- storage limited to non-secret preferences and a short-lived session;
- no `<all_urls>`;
- no history, bookmarks, downloads or unrelated browser permissions; and
- no remotely hosted executable code.

Expected responsibilities:

- display the approved corporate From identities returned by the relay;
- show a visually distinct corporate-send state;
- collect recipients, subject, supported body format and attachments from the
  active compose window only;
- transmit only the message the user explicitly sends;
- include an idempotency key;
- show the relay result;
- preserve or restore the draft when sending fails;
- never silently fall back to Gmail's native sender; and
- expose a version number for support and audit.

The extension will require access to the Gmail page. A compromised extension
could therefore inspect data visible in Gmail. Private ownership reduces supply
chain exposure but does not remove this privilege. Distribution and updates
must be controlled, signed and reviewed.

### 6.2 Relay service

The relay should be a separate project and credential boundary from the rental
application. A compromise must not reveal Supabase, Vercel production, Resend,
Stripe, AADE or administrative-mail credentials.

Minimum endpoints:

- authenticate or exchange an office identity for a short-lived relay session;
- list the sender identities permitted for that user;
- submit one message;
- query the status of a submitted message by idempotency key; and
- revoke sessions or disable all sending.

The send endpoint must:

1. authenticate the user;
2. confirm that the user, device and network are allowed;
3. accept only an allowlisted From identity;
4. normalize and validate recipient addresses;
5. enforce recipient, attachment, message-size and daily-volume limits;
6. reject executable or policy-disallowed attachment types if that is adopted;
7. generate the sender and envelope server-side;
8. use an idempotency key to prevent duplicate sends on retries;
9. call the regional Zoho API endpoint;
10. record message identifiers and delivery acceptance;
11. arrange the Gmail office copy; and
12. return a clear result without exposing upstream secrets.

The endpoint must never be a generic raw-message or arbitrary SMTP relay.

### 6.3 Zoho integration

Use OAuth Authorization Code flow and the smallest usable scope. The proposal
assumes `ZohoMail.messages.CREATE`; the prototype must prove that this scope
alone can:

- send as the canonical operational address;
- send as the approved aliases;
- send HTML and plain-text bodies;
- send attachments;
- preserve Reply-To, In-Reply-To and References as needed;
- save an appropriate copy in Zoho Sent; and
- return stable identifiers for audit and retry handling.

Any capability that requires a broader read scope must return to design review.
The default answer is not to add read access.

Store the Zoho client secret and refresh token only in a managed server-side
secret store. Rotate the client secret and OAuth authorization on a documented
schedule and immediately after suspected compromise.

### 6.4 Office identity and device control

The relay should accept only named office users. Sharing one relay credential
would defeat attribution and revocation.

Preferred controls:

- individual login;
- MFA, preferably passkeys;
- an allowlist of approved Google identities;
- device enrollment or Cloudflare Access/Tailscale device posture;
- office-network restriction when operationally practical;
- short session lifetime;
- explicit reauthentication for security-sensitive changes; and
- immediate per-user disablement.

Because the remote employee does not use the bridge, the relay can be restricted
more tightly than the Zoho mailbox itself.

### 6.5 Gmail copy and threading

The office Gmail view must contain the complete customer conversation.
There are two copy paths:

- remote Zoho replies use Zoho Auto BCC; and
- office bridge replies must create or deliver a Gmail copy.

The lowest-permission office-copy method should be chosen after testing.
Candidates:

1. BCC `anadyon.gr@gmail.com` from the Zoho API;
2. send a separate archival copy through Zoho; or
3. grant the relay a narrowly justified Gmail insertion permission.

Option 3 gives better Sent-folder placement but expands the relay's access to
Gmail. It must not be adopted merely for cosmetic convenience. A BCC copy plus
a Gmail filter may be sufficient.

Threading must be tested with Gmail, Outlook and at least one other receiver.
Subject-only grouping is not enough evidence. Validate `Message-ID`,
`In-Reply-To` and `References` behavior, and ensure neither the underlying
Gmail address nor relay metadata leaks to the customer.

## 7. Trust boundaries and assets

| Asset | Boundary |
|---|---|
| Gmail administrative history | Gmail account and office browsers; never the remote employee or Zoho send token |
| Zoho operational mailbox | Zoho account; remote staff and approved office staff |
| Zoho send authority | Relay secret store; send-only OAuth grant |
| Extension package | Reviewed repository source plus signed release |
| Relay deployment | Separate hosting project, identity policy and secrets |
| Audit metadata | Append-oriented store with restricted read access |
| Message bodies and attachments | Transient relay memory only, unless an explicit incident quarantine is designed |
| Booking-system Resend credentials | Existing application boundary; never available to the bridge |

## 8. Threat model

| Threat | Primary control | Residual risk |
|---|---|---|
| Public attacker uses the relay as an open mail relay | Authentication, device/network gate, server-side From allowlist and rate limits | Stolen office session may still send until revoked |
| Attacker steals the Zoho refresh token | Managed secret store, scope limited to message creation, rotation and kill switch | Attacker may send as approved operational identities and harm reputation |
| Malicious employee changes the From address | Relay ignores client sender and maps an approved sender server-side | Authorized sender can still send harmful content |
| Extension update becomes malicious | Private signed distribution, human-reviewed release, pinned dependencies and minimal permissions | Any extension with Gmail-page access remains sensitive |
| Extension reads unrelated administrative mail | Code limits itself to active compose; no background collection; review and tests | Browser permissions cannot technically prove intent; compromised extension can read the page |
| CSRF or cross-origin request triggers a send | Same-origin policy plus authenticated signed request, CSRF protection and extension identity checks | Browser compromise bypasses browser-level controls |
| Replay or client retry sends duplicates | Idempotency key and persisted send status | Upstream ambiguity must be reconciled rather than blindly retried |
| Attachment attack | Size/type limits, filename normalization and optional malware scanning | Novel malicious files may pass scanning |
| HTML or header injection | Structured API fields, strict validation and safe MIME construction | Rendering differences may still alter appearance |
| Message body appears in logs | Explicit redaction, structured safe logging and tests that fail on body/token fields | Platform-level crash capture must also be configured |
| High-volume abuse damages deliverability | Per-user and global caps, alerts, pause switch and Zoho limits | Low-volume targeted phishing may remain below thresholds |
| Forwarding causes DMARC or spam problems | Measure delivered headers at Gmail, preserve Zoho original and monitor failures | Forwarded mail can be classified differently by Gmail |
| Remote employee sees administration | Remote account is Zoho operational mailbox only | Misrouted aliases or forwarding rules could expose a message |
| Office Gmail compromise exposes both mail classes | MFA, device controls, login alerts and recovery process | Consolidation intentionally increases the value of the office Gmail account |
| Relay outage stops office corporate sending | Fail closed and direct staff to Zoho webmail | Temporary workflow disruption |
| Gmail UI change breaks extension | Versioned compatibility test and Zoho fallback | Maintenance remains necessary and timing is controlled by Google |
| Dependency compromise | Lockfile, automated scanning, small dependency set and reviewed upgrades | Build toolchain remains a supply-chain surface |

## 9. Security controls

### 9.1 Preventive

- Separate relay project and secrets.
- Send-only Zoho OAuth.
- Named office users and MFA.
- Approved-device or office-network access.
- Server-side sender mapping.
- Message and attachment limits.
- Per-user and global rate limits.
- Restricted extension permissions.
- Signed, manually approved extension releases.
- Content Security Policy with no remote scripts.
- Dependency lock and review.
- No production application credentials in the relay.

### 9.2 Detective

- Audit record for authentication result, employee, sender identity, recipient
  domains, recipient count, message size, attachment count, extension version,
  relay version, Zoho acceptance identifier and timestamp.
- Alerts for:
  - unusual send volume;
  - repeated authentication failures;
  - new recipient-domain spikes;
  - attempts to use a forbidden sender;
  - repeated attachment-policy violations;
  - token refresh failures; and
  - bridge sends outside expected operating hours, if that proves useful.
- Daily low-volume synthetic test during the pilot.
- Periodic reconciliation between relay acceptance, Zoho Sent and Gmail copy.

### 9.3 Recovery

- One-action relay pause.
- Per-user session revocation.
- Zoho OAuth revocation.
- Secret rotation runbook.
- Rollback to the previous signed extension.
- Zoho webmail fallback.
- Incident procedure for fraudulent mail, including recipient notification and
  domain reputation checks.

## 10. Privacy and retention

The relay processes customer correspondence and may handle personal data.
Minimize what it stores:

- message bodies and attachments: transient only;
- recipients: retain only as long as operationally justified, or store a keyed
  hash plus recipient domain where full address is unnecessary;
- audit actor, sender identity, timestamps and provider message IDs: retained
  for the agreed audit period;
- error captures: scrub content, authorization and cookies before leaving the
  process; and
- no analytics SDK that records DOM content or request payloads.

Before production, document the processor/controller position for the chosen
hosting provider, its region, data-processing terms, backup behavior and log
retention.

## 11. Deliverability and DNS

The bridge sends through Zoho rather than introducing a second corporate
sending provider. Zoho remains responsible for the outbound envelope and DKIM
signature. The migration still requires correct MX, SPF, DKIM and DMARC records,
with only one SPF policy at the root.

The booking application's Resend configuration remains separate. Any root SPF
edit must account for the actual envelope domains rather than simply adding
every service named in a From header. [EMAIL-DELIVERABILITY.md](EMAIL-DELIVERABILITY.md)
contains the earlier evidence and the warning against diagnosing from DNS alone.

Before production, collect full headers from test messages delivered to Gmail,
Yahoo/AOL and Outlook. Confirm SPF, DKIM and DMARC alignment for:

- direct Zoho webmail mail;
- remote replies with automatic BCC;
- bridge-created new mail;
- bridge-created replies; and
- forwarded incoming customer mail as seen in Gmail.

DMARC tightening is outside this proposal.

## 12. Failure behavior

| Failure | Required behavior |
|---|---|
| Relay unavailable | Extension preserves draft and directs user to Zoho webmail |
| Authentication expired | No send; explicit sign-in instruction |
| Zoho access token refresh fails | No send; alert operator; never fall back to Gmail sender |
| Zoho returns ambiguous timeout | Mark unknown, query/reconcile before retry; never blind retry |
| Attachment rejected | Preserve draft and identify the specific unsupported item |
| Gmail-copy step fails after Zoho accepted | Report "sent, archive copy pending"; retry only the copy |
| Zoho rejects sender alias | No alternate sender; configuration alert |
| Extension incompatible with Gmail UI | Disable corporate-send control; use Zoho |
| Audit store unavailable | Decide and document fail-open versus fail-closed before production; initial recommendation is fail closed for sends because attribution is a requirement |
| Volume threshold crossed | Pause or require operator approval according to the tested policy |

## 13. Implementation stages

### Stage 0 — review and measurements

- Claude performs an adversarial architecture review.
- Confirm the actual canonical operational address and aliases.
- Confirm the Zoho plan and regional API endpoint.
- Verify forwarding and outgoing Auto BCC availability.
- Capture the existing Gmail "Send as" and forwarding configuration.
- Decide hosting, device gate and audit retention.
- Resolve the questions in section 17.

No production settings change in this stage.

### Stage 1 — local proof of concept

- Test Zoho OAuth with a non-production address and
  `ZohoMail.messages.CREATE` only.
- Send plain text, HTML and attachments.
- Test alias sender support.
- Determine Sent-folder behavior and returned identifiers.
- Prove token revocation.
- Build a minimal extension against a test Gmail account.

### Stage 2 — isolated staging pilot

- Deploy the relay in its separate project with staging credentials.
- Add named test users.
- Exercise the extension against a dedicated test Gmail account.
- Run the acceptance and negative tests.
- Complete security review and dependency audit.
- Write the operating and incident runbooks.

### Stage 3 — controlled production pilot

Requires Tasos's explicit approval of the exact addresses, identities,
forwarding, Auto BCC, OAuth grant and deployment.

- Enable one operational sender for approved office users.
- Retain the existing Gmail "Send as" during the transition.
- Compare results for one to two weeks.
- Keep Zoho as the immediate fallback.
- Review audit records and false positives daily.

### Stage 4 — January 2027 cutover

- Confirm Google's final behavior against the live product.
- Remove reliance on Gmail's deprecated external "Send as".
- Keep the bridge only if the pilot evidence is satisfactory.
- Run the kill-switch and fallback drills.
- Update [EMAIL-DELIVERABILITY.md](EMAIL-DELIVERABILITY.md) with measured
  headers and the final path.

## 14. Acceptance tests

### Functional

- Incoming reservation message appears in Zoho and Gmail.
- Incoming administration message appears in Gmail and is absent from the
  remote Zoho account.
- Remote Zoho reply reaches the customer and is copied into Gmail.
- Office bridge reply reaches the customer from the correct corporate identity.
- New office message works for each approved alias.
- Replies remain correctly threaded for sender and recipient.
- Plain text, HTML, non-ASCII Greek, inline images and supported attachments
  render correctly.
- Zoho and Gmail retain the agreed copies.
- Duplicate clicks or retries send once.
- Failed sends preserve the draft.

### Authentication and authorization

- Unauthenticated requests fail.
- A valid user without sender permission fails.
- A remote user cannot use the bridge.
- A client-supplied `admin@` From fails.
- A client-supplied arbitrary From fails.
- A revoked session fails immediately.
- A revoked Zoho grant stops sending.
- An expired short-lived token cannot be replayed.
- Requests from unapproved devices or networks fail when that control is
  enabled.

### Abuse and resilience

- Recipient-count limit is enforced.
- Daily and burst limits are enforced.
- Oversized bodies and attachments are rejected.
- Header injection attempts fail.
- HTML/script payloads cannot execute in the relay or extension.
- Duplicate idempotency keys return the original status.
- Relay timeout after Zoho acceptance does not produce a duplicate.
- Zoho outage fails closed.
- Audit outage follows the chosen policy.
- Gmail DOM changes fail visibly.
- Extension update rollback works.
- Kill switch blocks all bridge sends.
- Zoho webmail fallback still works after the bridge is disabled.

### Privacy and logs

- Message bodies do not appear in normal logs.
- Attachments do not appear in logs or error reporting.
- OAuth tokens, cookies and authorization headers are redacted.
- Audit access is restricted and itself audited.
- Deleting a test account removes or anonymizes data according to the retention
  policy.

### Deliverability

For each path, inspect received headers rather than assuming from DNS:

- SPF passes for the correct envelope sender.
- DKIM passes and aligns with `anadyon.gr`.
- DMARC passes.
- No underlying Gmail address appears to the customer.
- Reply-To is correct.
- Bounce reaches an actively monitored destination.
- Gmail, Outlook and Yahoo/AOL receive the test.
- The BCC/archive copy does not create loops or duplicate customer delivery.

## 15. Operations

The runbook must cover:

- installing and updating the extension;
- onboarding and offboarding an office user;
- adding or removing a permitted sender alias;
- rotating Zoho OAuth;
- pausing all sends;
- investigating a send by audit ID;
- reconciling an ambiguous provider result;
- handling a customer report of spoofed or unexpected mail;
- restoring the previous extension version;
- switching the office temporarily to Zoho webmail;
- monitoring quota and reputation; and
- reviewing permissions quarterly.

A synthetic test must prove both sending and the office copy. A status page that
checks only whether the relay process is running is insufficient.

## 16. Alternatives considered

### A. Zoho for everyone

Strongest operational simplicity and least custom code. Rejected as the default
proposal because it abandons the office's long-established Gmail interface and
administrative history.

### B. Desktop unified client

Apple Mail, Outlook or Thunderbird can show Gmail and Zoho together. It remains
the lowest-risk technical solution, but does not satisfy the stated requirement
to keep Gmail's web interface.

### C. Google Workspace

Provides native custom-domain Gmail identities and avoids the extension.
Requires migration and recurring per-user cost. It remains the cleanest hosted
alternative and should be compared against the real build and maintenance cost.

### D. MailBridge

Closer to a complete hosted replacement. It requires an external provider to
hold operational mailbox credentials and Gmail OAuth. Anadyon's inbound
forwarding does not require that exposure, so using it for both sides is broader
than necessary.

### E. CustomFrom or another provider-API extension

Avoids a custom backend but places a sending-provider API key in each browser
and introduces another corporate sending path. The products reviewed were very
new and did not use Zoho as the authoritative mailbox.

### F. Reverse-alias services

Can relay Gmail replies from a corporate alias, but they alter mail routing and
are awkward for new conversations. They are designed primarily for aliases and
privacy, not a shared operational mailbox.

### G. Self-owned Gmail-to-Zoho bridge — proposed

Preserves Gmail web for the office, Zoho isolation for the remote employee and
a narrow send-only authorization. It creates maintenance and extension risk,
but bounds the custom component to the one capability Google is removing.

## 17. Unresolved questions

These must be answered with evidence before production:

1. What is the canonical operational sender:
   `customersupport@`, `customerservice@`, or both?
2. Are `jobs@` and `rentals@` aliases of that same Zoho account?
3. Does the current Zoho plan support external forwarding and outgoing Auto
   BCC?
4. Does Auto BCC fire for every remote workflow that will actually be used?
5. Can `ZohoMail.messages.CREATE` send from each required alias without a
   broader account scope?
6. Does the send API save a complete message in Zoho Sent?
7. Can it preserve reply headers and attachments with the create-only scope?
8. Is BCC into Gmail sufficient for threading, or is Gmail insertion required?
9. Which office users and devices require bridge access?
10. Can the relay be restricted to the office network, or is managed-device
    access required?
11. Which hosting region and provider meet the privacy requirement?
12. What metadata retention period is justified?
13. Should audit-store unavailability block sending?
14. What rate and recipient limits match real office use?
15. Which attachment types must be supported?
16. How will the private extension be signed and distributed?
17. How often will Gmail compatibility and kill-switch drills run?
18. What is the measured cost of Google Workspace for the actual number of
    office users, compared with maintaining the bridge?
19. Does forwarding into Gmail preserve all headers needed for reliable
    threading?
20. Which account receives bounces and who monitors them?

## 18. Estimate

Indicative effort after approval:

- architecture corrections and measured Zoho proof: 1–2 focused days;
- functional relay and extension pilot: 2–3 focused days;
- attachments, threading, copies and failure handling: 1–2 focused days;
- hardening, negative tests, runbooks and review fixes: 1–2 focused days; and
- monitored parallel pilot: 1–2 calendar weeks.

This is an estimate, not a delivery commitment. The largest uncertainty is
Gmail compose/thread integration, followed by Zoho alias and Sent-folder
behavior under the create-only scope.

## 19. Review request for Claude

Review this as an adversary, not as an editor. Please answer:

1. Can the requirements be met without a Gmail-reading permission?
2. Is provider-side forwarding plus Auto BCC sufficient to make Gmail a
   trustworthy office record?
3. Where can messages be lost, duplicated, misthreaded or sent from the wrong
   identity?
4. Is `ZohoMail.messages.CREATE` genuinely least privilege for the required
   behavior?
5. Can the extension avoid broad Gmail-page access while preserving the stated
   interface?
6. Which controls are enforceable and which are only promises made by our own
   code?
7. What attack allows an outsider, remote employee or compromised office device
   to send as Anadyon?
8. What is missing from the kill switch, token-rotation or incident response?
9. Does the design introduce a GDPR, retention or employee-monitoring problem?
10. Would Google Workspace or a desktop client be materially safer or cheaper
    once maintenance is priced honestly?
11. Which acceptance or negative test could pass while the real control is
    inert?
12. What evidence must be collected before approving a production pilot?

Please classify findings by severity, distinguish verified facts from
assumptions, and recommend one of: proceed to proof of concept, revise and
re-review, or abandon.
