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

---

## Addendum — Tasos states the requirement: one mailbox for office staff

**26 October 2026, after the review above.** Tasos: *"It's important to have
only one mailbox for those working in the office."*

That is a decision, not a preference to be argued with, and it changes the
recommendation. **It also argues against the bridge rather than for it**, which
is worth setting out because the proposal reads as though it were the thing that
delivers it.

### The bridge does not give one mailbox. It gives one view over two.

Under PR #241, office staff see a Gmail account that contains:

- their own administrative mail, which actually lives in Gmail;
- **forwarded copies** of incoming reservation mail, which actually lives in
  Zoho;
- **BCC'd copies** of the remote employee's replies, which actually live in Zoho;
- and replies they send themselves, which leave via a relay and are saved in
  Zoho's Sent folder, not Gmail's.

That is two mailboxes stitched together with forwarding, an outgoing filter and
a relay. **Every seam is a place the unification can be incomplete**, and HIGH 2
and HIGH 3 above are exactly those seams: Auto BCC that may not fire for a mobile
workflow, and copies that may not thread. The office would have one window
showing an approximation of two mailboxes, with no indication when the
approximation is wrong.

**Measured against the stated requirement, a single real mailbox is strictly
better than a synthesised one** — and both of the alternatives below provide one.

### Two options give one genuine mailbox

| | **Zoho for everyone** | **Google Workspace** |
|---|---|---|
| One real mailbox for office staff | yes | yes |
| Interface | Zoho webmail or any IMAP client | **Gmail, the one they know** |
| Existing Gmail history | migrate in over IMAP | migrate in (Google-to-Google) |
| Remote-employee isolation | separate Zoho user, access to the reservation mailbox only | separate Workspace user with delegated access to a shared reservations mailbox only |
| Authentication | **working today** — `dkim=pass header.s=zmail`, verified | native, the account *is* the address |
| January 2027 | irrelevant — no *Send as* anywhere | irrelevant — a Workspace alias, explicitly unaffected |
| Custom code | **none** | **none** |
| Cost | the plan already bought | per user, per month, recurring |
| Work still to do | migrate the Gmail history, add office users | migrate mail and DNS again, add users |

**Both deliver the isolation natively**, which is the part the bridge was built
to achieve and the part that needs no building at all: in Workspace through
delegated access to a shared mailbox, in Zoho through a second user scoped to the
operational mailbox. Neither needs an extension with read access to the
administrative mailbox — **BLOCKER 2 disappears in both.**

### The question that decides it

**Does "one mailbox" mean one *interface*, or specifically *Gmail's* interface?**

- **If any single interface is acceptable** — then Zoho already is that mailbox.
  It works, it is authenticated, it is paid for, and the remaining work is
  migrating the Gmail history into it and adding office users. Cheapest path,
  and mostly done.
- **If it must be Gmail** — then **Google Workspace**, and the cost is the price
  of that requirement. It is the only option that puts one real, authenticated,
  domain-addressed mailbox inside the Gmail interface with the history carried
  over. Codex's §16 C called it *"the cleanest hosted alternative"*, and under
  this requirement it is also the correct one.

**In neither case is the bridge the answer.** It is more work than Workspace,
permanently maintained rather than vendor-maintained, and it delivers a worse
version of the thing being asked for.

### What is still unknown, and it is the cost driver

**How many office mailboxes are needed?** Neither this review,
`PAPAKI-DEPENDENCY-AND-EXIT-OPTIONS.md` §6 nor PR #241's unresolved #9 can
answer it, and it is the only input the Workspace comparison needs. One user is a
small annual figure; five is five times that and starts to rival the bridge's
build cost — though not its maintenance.

### On today's Zoho work, in case it looks wasted

It is not, whichever option wins. It ended a live outage — Yahoo had been
refusing every office reply — and it did so in hours. It also proved the whole
DNS procedure end to end, which is the same procedure a Workspace move would
follow, now written down with the traps named. If the answer turns out to be
Workspace, today bought working mail in the interim and a rehearsed runbook for
the move.

---

## DECIDED — Gmail UI, so Google Workspace

**26 October 2026.** Tasos: *"It needs to be gmail UI."* With the one-mailbox
requirement, that settles it: **Google Workspace on `anadyon.gr`**.

**PR #241's bridge is not the route**, and the reason is now simple rather than
a list of findings: Workspace delivers natively what the bridge was built to
synthesise. The account **is** `…@anadyon.gr`, so there is no *Send as* to be
withdrawn, no extension, no relay, no forwarding seams, and no custom component
with read access to the administrative mailbox.

### What Workspace gives, against the requirements as stated

| Requirement | How Workspace meets it |
|---|---|
| One mailbox for office staff | one real Workspace account, not a stitched view |
| Gmail UI | it **is** Gmail |
| Years of history, labels, contacts | migrated from `anadyon.gr@gmail.com` with Google's own migration tooling, Google-to-Google |
| Reservation replies authenticated as `@anadyon.gr` | native DKIM at `google._domainkey`; the account is the address |
| January 2027 | **moot** — Google's page says the withdrawal *"does not affect Google Workspace aliases or other Gmail addresses you own"* |
| Remote employee isolated from administrative mail | native, by account separation — see the open question below |
| Booking mail unchanged | Resend on `send.anadyon.gr` untouched, as always |
| Custom code | **none** |

### Cost — and the number this still needs

Checked today and **no reliable current euro figure was found**, which is worth
saying rather than quoting a stale one. What the sources give:

- **Business Starter at €8.10 per user per month** on flexible monthly billing,
  after a price rise that took effect 17 March 2025 — but that figure is from a
  2025 article.
- **$7 per user per month on annual billing**, $8.40 monthly, in several guides
  updated in 2026.
- **£5.90 per user per month** annual, excluding VAT, in a UK guide.

So the order of magnitude is **€7–8 per user per month**, and the exact European
annual price should be read from Google's own pricing page before committing.

**The blocking input is unchanged and is still unanswered: how many office
mailboxes are needed?** One user is roughly €85–100 a year. Four is four times
that. Neither this project's documents nor PR #241's unresolved #9 can supply it,
and it is the only number the decision now lacks.

### The one design question that is genuinely open

Office staff need **one inbox** holding both administrative and reservation mail.
The remote employee needs reservation mail and **not** administrative mail. In
Workspace there are three patterns, and they are not equally safe:

1. **`customerservice@` as an alias on the office account.** Aliases are
   explicitly exempt from the January change, and all mail lands in one inbox —
   which is exactly the requirement. **But an alias belongs to one account**, so
   this alone does not give the remote employee access.
2. **`customerservice@` as a Google Group** with the office user and the remote
   employee as members. Mail delivers to both inboxes: the office sees it in
   their single inbox, the employee in theirs, and neither sees the other's
   private mail. **Sending** as the group address is set up per user through
   Gmail's *Send mail as* with a confirmation code to the group.
   **UNVERIFIED and worth checking before relying on it:** whether sending as a
   *group* address falls under the January exemption. Google's wording is
   *"Workspace aliases or other Gmail addresses you own"*; a group address is on
   your own domain, so it very probably qualifies — but "probably" is not the
   standard this project uses, and the Admin console should be checked.
3. **`customerservice@` as its own user with delegated access.** Robust and
   unambiguous, but Gmail shows a delegated mailbox as a **separate view**, which
   is two mailboxes again and conflicts with the stated requirement.

**Pattern 2 is the one that satisfies both requirements**, with pattern 1 as the
fallback for the office side if group send-as turns out to be affected. This is
the piece to settle during setup, with evidence, not by assumption.

### Sequencing, and what happens to Zoho

**Do not cancel Zoho when Workspace is set up.** Same discipline as Papaki: keep
it until Workspace is proven for both directions, then decommission. The DNS
procedure is the one rehearsed today — DKIM and SPF first, test, MX last — and
`DNS-MOVE-TO-CLOUDFLARE.md` plus `ZOHO-MAIL-CUTOVER-STEPS.md` both apply almost
unchanged, with Google's values in place of Zoho's.

**And today's Zoho work was not wasted**, which is worth stating plainly because
it will look like it was. It ended a live outage within hours — Yahoo had been
refusing every office reply for days — and it rehearsed the entire DNS procedure
end to end, with the traps named, on the exact zone a Workspace move will touch.
The interim mailbox is also the fallback while Workspace is proven.

### What this closes

- **PR #241** should be closed or left as a recorded alternative. Its design is
  sound for the problem it set itself; the problem has a native answer.
- **E38** becomes fully moot rather than one housekeeping action: with Workspace
  there is no third-party *Send as* anywhere in the estate.
- **The remote-employee isolation** stops being a build and becomes a
  configuration.

---

## The three requirements conflict after January 2027 — 26 October 2026

Tasos added: *"We are looking for a non costly solution."* Taken with the two
stated requirements, that is **one mailbox + Gmail UI + no recurring cost**, and
after January 2027 **no option delivers all three**. This section exists so the
trade is made deliberately rather than discovered.

### Why they conflict

A mailbox at `@anadyon.gr` inside the Gmail interface requires one of:

- **a Workspace account** — the address is the account, and that costs money; or
- **Gmail's *Send as*** — free, and withdrawn in January 2027; or
- **something custom** that re-creates *Send as* — PR #241's bridge, which costs
  engineering time rather than subscription.

There is no fourth mechanism. Google removed the free one.

### The options, with costs stated honestly

| | Recurring cost | One mailbox | Gmail UI | Survives Jan 2027 |
|---|---|---|---|---|
| **Workspace** | ~€7–8 / user / month | **yes** | **yes** | **yes** |
| **Zoho for everyone** | already paid | **yes** | no — Zoho's UI | **yes** |
| Gmail + forward, reply in Zoho | already paid | no — two places | partly | yes |
| **PR #241's bridge** | no subscription, but **permanent maintenance** | no — a view over two | yes | yes |

### "Non-costly" probably points at Workspace, and the reason is the user count

**This is the part worth pausing on.** The bridge has no subscription, which
makes it look like the cheap option. It is not free — it is **5–10 focused build
days plus an open-ended liability**: an extension coupled to Gmail's DOM, which
Google changes without notice or compatibility contract, maintained by two agents
and one person, forever.

Against that, Workspace at the order of magnitude found today:

| Office users | Workspace per year |
|---|---|
| 1 | ≈ €85–100 |
| 2 | ≈ €170–200 |
| 4 | ≈ €340–400 |

**If the office is one or two people, Workspace is very likely the cheaper
option outright**, not merely the safer one — €170–200 a year is less than the
cost of the first week of keeping a browser extension working. The honest
comparison is subscription versus permanent engineering, and at small user
counts the subscription wins decisively.

**Which is why the user count is not a detail.** It is the whole decision, and it
is the one number nobody in this project has.

### The genuinely free option, and what it actually costs

**Zoho for everyone.** Already paid for, already working, authentication already
verified. One mailbox, native isolation for the remote employee, nothing to
build, nothing to maintain, January 2027 irrelevant.

**What it costs is the Gmail interface** — and that is a real cost, not a
rounding error: years of habit, labels, filters and muscle memory. It is just
not a *monetary* cost, and it is worth deciding knowingly rather than paying
€200 a year or a permanent maintenance burden to avoid it.

Mitigations that cost nothing: the Gmail **mobile app** can hold the Zoho mailbox
as a full IMAP account and still send after January 2027 — Google recommend it —
so phones keep the familiar app. Only the desktop changes.

### There is no emergency, and that matters

**The current arrangement works until January 2027.** *Send as* still functions,
office mail is authenticated as of today, and the Yahoo outage is closed. So
there are roughly **two months** to decide, which is enough to answer the user
count, read Google's real European price, and try Zoho's interface for a week
before paying to avoid it.

**What should not happen in those two months** is building the bridge to save a
subscription that may turn out to be €85 a year.

### Recommendation

1. **Count the office mailboxes.** One number, and it decides everything.
2. **If it is one or two:** Workspace. Cheaper than the bridge once maintenance
   is priced, and it meets every stated requirement natively.
3. **If it is four or more, or if any recurring cost is unacceptable in
   principle:** Zoho for everyone, and accept the interface change — with the
   Gmail app over IMAP on phones to soften it.
4. **Either way, not the bridge.** It is the most expensive option once
   maintenance is counted, and the only one that adds a custom component with
   read access to the administrative mailbox.
