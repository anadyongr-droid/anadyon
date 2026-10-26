# Review: the Gmail–Zoho office mail bridge proposal (PR #241)

**Last verified:** 26 October 2026, Claude — reviewing
[`GMAIL-ZOHO-OFFICE-MAIL-PROPOSAL.md`](GMAIL-ZOHO-OFFICE-MAIL-PROPOSAL.md) at
Codex's request, adversarially as asked.

**Verdict: revise and re-review** — and the revision is structural rather than
editorial. **My recommendation on the central question is: do not build the
bridge.** That is a §13 decision and therefore Tasos's; this document is the
evidence for it, not the decision.

---

## First, what the document gets right

This is careful work and the parts that are right are the hard parts.

- **The threat model and trust boundaries are real**, not decorative, and the
  framing in review question 6 — *"which controls are enforceable and which are
  only promises made by our own code"* — is the right question to ask of this
  design and most others.
- **§2.3 states as a non-goal: "treating a browser extension as a security
  boundary."** That is the honest position and most proposals of this shape do
  not say it.
- **Resend is correctly held out of scope.** Booking mail is the half of the
  estate that works, and keeping it untouched is right.
- **Provider-side forwarding surviving January 2027 is correct**, and
  checkable — Google's scope page says the change does not affect receiving
  forwarded mail.
- **The relay design is sound where it is specified**: server-side `From`
  enforcement, idempotency keys, no raw-message or arbitrary-SMTP endpoint,
  credential separation from the rental application. If a bridge were built,
  this is roughly how.
- **Twenty unresolved questions, each genuinely unresolved**, and an estimate
  labelled as an estimate. The document asks to be reviewed rather than
  approved.

None of what follows is a criticism of the engineering. It is a criticism of
what the engineering is *for*.

---

## BLOCKER 1 — the proposal bundles a solved problem with an unsolved one

§1 states two needs as one decision:

1. **Isolation** — a remote employee must read and answer reservation mail
   without reaching tax, accountant, supplier or account-recovery messages.
2. **Continuity** — the office keeps `anadyon.gr@gmail.com` as its interface,
   with its history, labels and habits.

**Requirement 1 is already satisfied, as of today, with no new code.**
`customerservice@anadyon.gr` is now a Zoho mailbox: outbound verified by headers
(`dkim=pass header.s=zmail`, `spf=pass`, `dmarc=pass`), inbound verified by a
test message arriving. Give the remote employee credentials for **that mailbox
only**. They never touch Gmail, because Gmail is a separate account with a
separate password. The isolation is a consequence of the account structure, not
of anything that needs building.

**Every component in this proposal exists to serve requirement 2.** The
extension, the relay, the OAuth integration, the audit store, the rate limits,
the device control, the kill switch and the Gmail-compatibility maintenance are
all in aid of office staff not having to open a second tab.

**So the two should be separated.** Then the security win ships immediately and
the convenience question gets priced honestly on its own — which is where it
looks much worse. As written, the security framing lends urgency to a
convenience feature.

## BLOCKER 2 — the extension reintroduces the exact exposure the isolation exists to prevent

§6.1, to its credit, says this plainly: *"The extension will require access to
the Gmail page. A compromised extension could therefore inspect data visible in
Gmail."*

Follow that through. Gmail is where, per §1, *"tax, accountant, supplier,
account-recovery or other administrative messages"* live. So the design:

- protects the **remote employee** from administrative mail — which the Zoho
  account structure already does; and
- builds a **new, custom, permanently-maintained component with read access to
  that administrative mail**, installed on every office device.

That is a net **increase** in exposure of the most sensitive mailbox in the
business, accepted in exchange for a UI preference. And the asset at risk
includes account-recovery mail, which is the path to everything else.

**The kill switch does not cover this.** §9's kill switch revokes the relay's
*sending* authorization. A compromised extension that is reading Gmail is
unaffected by it. The document should say which of the two risks the kill switch
addresses, because at present it reads as covering both.

---

## HIGH 1 — the gap is narrower than §1 and §4.4 state, which changes the alternatives

§1: *"Gmail web will no longer send through a Zoho-hosted `@anadyon.gr`
identity."* §4.4 builds the extension on that.

**Read from Google's scope page today** (`support.google.com/mail/answer/17101213`):

- *Send as* ends on **web and mobile apps** — so the phone is not a loophole,
  and the document is right not to claim it is.
- **But:** *"you can continue to read and send emails from your other account in
  the Gmail app"* over *"a standard IMAP connection"*, and Google recommend that
  route for sending. That is not *Send as*; it is Gmail acting as an ordinary
  client over Zoho's SMTP.
- Desktop clients over IMAP/SMTP are untouched.

**So the real gap is Gmail on the desktop web, specifically.** Not "Gmail cannot
send as the domain". That matters because §16 rejects alternatives B (desktop
client) and C (Workspace) for not satisfying the Gmail-web requirement — and the
requirement is now visibly narrower than the cost of meeting it.

**Also missing:** January 2027 removes **Gmailify and POP** as well. §1 mentions
only *Send as*. If any current office workflow uses *"Check mail from other
accounts"*, it is also affected, and the document should say so.

## HIGH 2 — Auto BCC is load-bearing and can fail silently

§4.2 makes the office's record of outbound reservation mail depend on a Zoho
outgoing filter BCCing Gmail. The document correctly notes Auto CC/BCC does not
apply to external IMAP/POP clients, and unresolved #4 asks whether it fires for
every workflow.

**The consequence is not drawn, and it is the serious part.** If Auto BCC does
not fire for some path the remote employee actually uses — the Zoho mobile app
is the obvious candidate — then the office's record is **quietly incomplete**,
and nothing reports it. Replies to customers exist, and the office cannot see
them.

This project has now found that shape of defect in its own instruments five
times, most recently today: the staging reset verified fixture counts and never
asked whether the seed could price, so a staging environment unable to quote
would have been reported as a success. **Verifying Auto BCC once at pilot time
is not enough.** Any design depending on it needs a **detector** — a periodic
reconciliation that counts messages in Zoho Sent against copies in Gmail and
alerts on divergence. That is not in §9.2.

## HIGH 3 — the BCC'd copy probably makes a poor office record, and threading is unresolved

Unresolved #8 and #19 ask whether BCC is sufficient for threading and whether
forwarding preserves the headers. Those are the right questions; the risk is
what happens when the answer is "partly".

A BCC'd copy arrives in Gmail as a **new inbound message from the mailbox**.
Whether it threads with the original depends on `References`/`In-Reply-To`
surviving a forward and a BCC. When it does not, the office view becomes
interleaved fragments rather than conversations — and worse, **a reply composed
from one of those copies is a new ambiguity**: does the user click Gmail's native
Send or the bridge's? §4.4 requires the extension to make the path obvious and
fail closed, which is the right intent, but the live failure is a tired person
clicking the wrong button on a threaded copy and mailing a customer from
`anadyon.gr@gmail.com`.

That is the §13-relevant failure — a customer receiving the wrong identity — and
it is created by the design rather than mitigated by it.

---

## MEDIUM 1 — the sender address is wrong throughout, and unresolved #1 is answerable now

The document uses `customersupport@anadyon.gr` and flags the ambiguity as
unresolved question #1. **It is resolvable with evidence, today:**

| Source | Value |
|---|---|
| DKIM identity on a verified delivered message | `i=customerservice@anadyon.gr` |
| `_dmarc.anadyon.gr` `rua` | `mailto:customerservice@anadyon.gr` |
| Application code | `customerservice@anadyon.gr` in ~8 files under `app/` |
| Occurrences of `customersupport` anywhere in the repository | **none** |

**Canonical is `customerservice@`.** The proposal should be corrected throughout
before anyone configures from it, because a document that names the sender wrong
is a document someone will paste into a DNS panel or an allowlist.

## MEDIUM 2 — the recurring cost is unpriced, and it is the deciding number

§18 estimates **5–10 focused days plus a 1–2 week pilot** to build. It prices
maintenance at nothing.

A Chrome extension that injects a sender selector into Gmail's compose window is
coupled to **Gmail's DOM**, which Google changes without notice and offers no
compatibility contract for. Unresolved #17 — *"how often will Gmail
compatibility and kill-switch drills run?"* — concedes the cost exists without
naming it. The honest comparison is:

- **Workspace:** a known monthly figure per user, vendor-maintained, native DKIM,
  and *Send as* becomes irrelevant because the account **is** the address.
- **The bridge:** a one-off build plus an open-ended engineering liability on a
  component that breaks when a third party ships a UI change, maintained by two
  agents and one person.

§16 C says Workspace *"should be compared against the real build and maintenance
cost."* Agreed — and that comparison is the decision, so it belongs in the
document rather than deferred to unresolved #18.

## MEDIUM 3 — least privilege is probably right but unproven, and the fallback is unstated

§6.3 assumes `ZohoMail.messages.CREATE` suffices and requires the prototype to
prove it. Good. But §6.3 says *"any capability that requires a broader read scope
must return to design review"* without saying what happens then. **If the
create-only scope cannot preserve reply headers or save to Sent, the design needs
read access to the operational mailbox** — at which point the relay can read
customer correspondence, and the privacy section (§10) changes materially. That
branch should be written down now, because it is the likely one.

---

## Answers to the review questions it asked

Briefly, and only where I can add something:

1. **Can the requirements be met without Gmail-reading permission?** The
   *isolation* requirement, yes — entirely, today. The *Gmail-web-compose*
   requirement, no: injecting UI into Gmail requires page access, and page access
   is read access.
2. **Is forwarding + Auto BCC sufficient to make Gmail a trustworthy record?**
   Not as specified. It needs a reconciliation detector, not a one-time
   verification — see HIGH 2.
3. **Where can messages be lost or sent from the wrong identity?** Auto BCC not
   firing for a mobile workflow (lost); forwarding plus BCC breaking threading
   (misthreaded); a user clicking Gmail's native Send on a threaded copy (wrong
   identity). The third is the one that reaches a customer.
4. **Is `messages.CREATE` least privilege?** Plausibly, unproven, and the
   fallback branch is unwritten.
6. **Which controls are enforceable?** Server-side `From` enforcement, scope
   restriction, rate limits and the audit store are enforceable — they are on the
   relay. Everything in the extension is a promise, including "never silently
   fall back to Gmail's native sender", which the document already classifies
   correctly by making the extension a non-boundary.
7. **What attack sends as Anadyon?** A compromised office device with a valid
   relay session — and the design's own controls then work as intended, limiting
   it to approved senders with attribution. The sharper attack is not sending as
   Anadyon but **reading** the administrative mailbox via the extension, which is
   BLOCKER 2 and is not in §8's threat list.
10. **Would Workspace or a desktop client be materially safer or cheaper?**
    Safer: yes, both — neither adds a component with read access to the
    administrative mailbox. Cheaper: unknown until §18's maintenance is priced,
    which is MEDIUM 2.
11. **Which acceptance test could pass while the control is inert?** The Auto BCC
    test in §14. Verified once, from Zoho webmail, it passes; the remote employee
    then uses the mobile app and the office record silently stops being complete.

---

## What I would do instead

1. **Ship the isolation now.** Remote employee gets `customerservice@anadyon.gr`
   in Zoho, nothing else. No build. This is the requirement with the actual
   business risk behind it and it is already available.
2. **Let the office use Zoho for reservation mail** — webmail in a tab, or the
   Gmail *app* with the mailbox added as IMAP on phones, which survives January
   2027 and is Google's own recommendation. Administrative mail stays in Gmail,
   untouched.
3. **Keep forwarding into Gmail if the office wants visibility** — it survives
   the change and costs nothing. But treat it as a convenience copy, **not a
   record**, and do not build anything that depends on its completeness.
4. **Price Workspace properly** against the bridge's build *and* maintenance, for
   the real number of office users. If the Gmail-web habit is genuinely worth
   money, Workspace buys it natively, vendor-maintained, with none of BLOCKER 2.
5. **Revisit the bridge only if** 2–4 are tried and the office genuinely cannot
   work that way. Then this document is a good starting design.

**The strongest argument against building it** is not any individual finding
above. It is that the proposal spends a permanent engineering liability and a new
path into the administrative mailbox to avoid clicking a second tab — and the
project has just spent three days discovering that the office mail estate was
held together by arrangements nobody had tested. Fewer moving parts is the
lesson, not more.

**That said:** requirement 2 is a real business preference and I am not the one
who works in that mailbox every day. If Tasos judges the Gmail-web continuity
worth the cost, this design is a reasonable basis — with BLOCKER 2 accepted
explicitly, HIGH 2's detector added, and the naming fixed.
