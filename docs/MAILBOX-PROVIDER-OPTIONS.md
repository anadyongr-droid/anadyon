# Where the office mailboxes should live

**Last verified:** 24 October 2026, Claude — researched on request for a
dependable alternative to Google Workspace that is free or cheaper. **An
options paper, not a decision**: spend and a change to how staff work, which
`AGENTS.md` and `DEFINING-STATEMENTS.md` §13 reserve to Tasos. **Prices move
and most sources are comparison blogs — confirm on the provider's own page
before committing.**

---

## 1. The requirement, stated before the shopping

Not "email hosting" generally. Specifically:

1. **Send as `customerservice@anadyon.gr` with DKIM aligned to that domain** —
   the thing that is broken (E34) and the thing Yahoo demands.
2. **IMAP**, so the Gmail workflow survives. *Several cheap plans exclude it;
   Zoho's free tier is one.*
3. **Dependability** — Tasos's word, and it carries weight here: this paper
   exists because a provider stopped answering, so a cheaper provider with a
   smaller support operation is not automatically an improvement.
4. **No certificate anyone must renew.** The present outage *is* an unrenewed
   certificate (E6). Any option where we own one re-creates the failure.

## 2. The free option, and it is real

**Inbound: Cloudflare Email Routing. Outbound: Resend SMTP.**

| Half | How | Cost |
| --- | --- | --- |
| Receiving | Cloudflare Email Routing forwards `customerservice@anadyon.gr` into the existing Gmail | **free** |
| Sending | Gmail *Send mail as* relays through `smtp.resend.com` | **free within the existing Resend plan** |

**Why it works here and would not elsewhere:** Resend is *already* configured
for this domain. `resend._domainkey.anadyon.gr` is published and booking
confirmations already pass SPF, DKIM and DMARC through it
(`EMAIL-DELIVERABILITY.md`). Staff replies would be signed `d=anadyon.gr` by
infrastructure already proven for this exact domain.

Resend's own documentation gives the settings:

```
Host:     smtp.resend.com
Ports:    25, 465, 587, 2465, 2587    (465/2465 implicit TLS; 25/587/2587 STARTTLS)
Username: resend                       (the literal string)
Password: a Resend API key
```

**Four caveats; the third is the serious one.**

1. **Cloudflare Email Routing cannot send** — their docs are explicit: no
   outbound, no SMTP server. Hence the separate outbound half.
2. **Forwarded mail can fail a strict DMARC policy.** `anadyon.gr` is `p=none`
   today so it is not live, but it constrains tightening DMARC later.
3. **Resend's free tier is 3,000/month and 100/day — and that quota is already
   being spent on booking confirmations.** Staff replies would share it. In
   season that could bind. **Which Resend plan this project is on was not
   established**; on Pro ($20/month, 50,000 emails, no daily cap) the concern
   disappears.
4. **Using a transactional provider as a personal relay should be checked
   against their terms.** Not verified here.

**What it does not give you:** a mailbox. No server-side store, no webmail, no
second device reading the account independently of Gmail. It is forwarding plus
relay — excellent as a zero-cost interim, not a mail service.

### The free tier's cap is not close to binding — measured 24 October

Tasos confirmed the project is on Resend's **free plan** (3,000/month, 100/day).
`scripts/sql/readonly/resend-volume.sql`, run against production
(**40101058605**):

```
busiest days          by month                all time
2026-10-23  2         2026-10   5             2026-08-25 .. 2026-10-23   19
2026-09-14  2         2026-09  10
2026-09-12  2         2026-08   4
2026-08-25  2
```

**The busiest day in the system's history sent two emails.** The busiest month
sent ten. Nineteen in total across two months.

So booking mail consumes **2% of the daily allowance at its peak** and well
under 1% of the monthly one. Staff replies would have to run at roughly
**fifty times** the entire current volume before the free tier bound. **Caveat
worth stating:** these are two months of early operation, not a full season —
but the headroom is two orders of magnitude, so a busy summer does not change
the conclusion.

**The third caveat in §2 is therefore closed.** The free option is viable on
the plan already held.

### And the fix decomposes — the broken half needs no DNS change at all

**This is the most useful finding in this document.** The outbound problem
(E34) and the inbound migration are independent, and only the first is broken:

- **Outbound** — Gmail *Send mail as* currently relays through
  `mail.anadyon.gr`, whose certificate expired. Pointing it at
  `smtp.resend.com` instead fixes authentication **immediately**: Resend's DKIM
  key for this domain is already published, so the reply is signed
  `d=anadyon.gr` and aligns with the `From:` header. **No DNS record changes.
  No new supplier. Reversible in a minute** by putting the old server back.
- **Inbound** — mail still arrives perfectly well through Papaki's MX today.
  Nothing is broken about receiving, so moving it to Cloudflare Email Routing
  is a *tidying* exercise that can happen calmly, later, or never.

**So the sequencing is: fix sending this week with one Gmail setting; decide
about DNS, inbound and cancelling Plesk separately.** That separation also
means the urgent fix carries none of the MX-cutover risk that made the
migration look daunting.

## 3. Real mailboxes, ranked against what was actually asked

| Provider | Price | IMAP | Dependability | Note |
| --- | --- | --- | --- | --- |
| **Zoho Mail Lite** | **~$1/user/month, annual** (5GB; ~$1.25 for 10GB) | ✅ | **High** — very large company | **Best value that is also dependable.** The *free* tier excludes IMAP/POP |
| **Fastmail** | ~$5/user/month | ✅ | **High** — two decades, strong reputation | Between Zoho and Google |
| **Google Workspace** | ~$7/user/month annual (~$8.40 monthly) | ✅ | **Highest** | Gmail *becomes* the account, so "Send mail as" disappears rather than being reconfigured |
| **Microsoft 365 Business Basic** | ~$6/user/month | ✅ | **Highest** | Natural only if the office already lives in Office |
| **mailbox.org** | ~€1/user/month **plus a business service package** | ✅ | Medium-high | Sources disagree sharply on real business cost |
| **Purelymail** | ~$10/**year** flat, unlimited users and domains | ✅ | **Low — very small operation** | See the warning |
| **Migadu** | ~$19/**year** (Micro), priced per account | ✅ | **Low — small operation** | **Micro sends only 20/day across the whole account** — a rental business answering quotes would hit it |

### The warning that matters most here

**Do not replace an unresponsive provider with a smaller one.** Purelymail and
Migadu are remarkable value run by very small teams. For a hobby domain that is
a fine trade. For the address customers reply to, immediately after being burned
by exactly this failure mode, it is the wrong direction.

## 4. Recommendation

**If cost matters most: Zoho Mail Lite, ~$12 per mailbox per year.** Real
mailboxes, IMAP, proper DKIM, nothing to renew, and a company large enough to
answer. Three mailboxes ≈ **$36/year**, against ~**$252/year** for the same
three on Google Workspace.

**If familiarity matters most: Google Workspace** — seven times the price, and
it buys one concrete thing: the account *becomes* `customerservice@anadyon.gr`,
so the mechanism that broke ceases to exist.

**The free option is a legitimate third answer**, best treated as an interim:
it fixes the authentication problem this week at zero cost, and if DNS has
already moved to Cloudflare it can be replaced by a real mailbox later with no
further DNS change.

## 4a. Self-hosting on a cheap VPS — asked 24 October, and the answer is no

*A fair question, and it deserves more than a reflex. Modern tooling —
Mailcow, Mail-in-a-Box, Poste.io — has made self-hosted mail far more
approachable than it was ten years ago. The objection is not that it is hard.*

**It is not cheaper at this scale, which settles it before the technical
argument begins.**

| | Annual cost |
| --- | --- |
| Zoho Mail Lite, 3 mailboxes | **~$36** |
| Hetzner CX-class VPS (~€4.50/month) | **~€54**, before a minute of anyone's time |

Self-hosting becomes economic somewhere around twenty mailboxes, because the
VPS cost is flat while per-user pricing is not. Anadyon has a handful. **The
one scale argument for self-hosting does not apply.**

### What it would actually take

Recorded so the question does not have to be re-researched:

1. **Port 25 outbound, which is blocked by default almost everywhere.**
   **DigitalOcean** blocks 25, 465 *and* 587 on all droplets and documents no
   unblock route — their own guidance is to use a third-party email service.
   **Hetzner** is contested across sources: some say 25 is open, others that
   25 and 465 are blocked with 587 left open, and that a limit request is
   considered **case by case after a month as a customer and a paid invoice**.
   Either way it is a negotiation before the server can send at all.
2. **A clean dedicated IPv4 with a matching PTR record.** Cheap VPS ranges are
   frequently already on blocklists; the address has to be checked against
   Spamhaus and others *before* committing.
3. **Reputation from zero.** A new IP is treated harshly by Gmail, Outlook and
   Yahoo. **This is the decisive point for Anadyon specifically: the problem
   being solved is already a deliverability problem.** Trading a known
   authentication fault for an unknown reputation fault is not an improvement —
   it swaps a bounce that tells you what is wrong for silent spam-filing that
   does not.
4. **Certificate renewal — owned by us.** Mailcow automates Let's Encrypt, but
   the renewal still depends on the server being healthy, the ports open and
   DNS correct. **This outage is an unrenewed certificate.** Self-hosting does
   not remove that failure mode; it removes the person you can escalate it to.
5. **Security patching, for ever.** A mail server is a high-value target.
   **The evidence against us here is our own:** this project currently has a
   Plesk server running PHP unpatched against a CVSS 9.2 unauthenticated RCE
   (E33) and a WordPress rated 10.0 (E36), precisely because nobody maintains
   it. Adding a second server to maintain — for the most business-critical
   communication channel there is — would repeat the pattern knowingly.

### The hybrid that *is* legitimate, and still loses

Self-host the mailboxes and **relay outbound through a reputable sender**
(Resend, SES, Brevo). This is a real architecture and it solves the reputation
problem properly, because delivery happens from the relay's IPs.

It still costs a VPS plus maintenance plus the relay, to replace a $12/mailbox
service. **It is strictly more work and more money than Zoho, for the same
outcome.**

### Where self-hosting would be right

Twenty or more mailboxes; or an in-house technical operator who wants the
control; or a hard data-residency requirement. **None of those is true here**,
and the first is the only one that would change the arithmetic.

### The honest trade

Self-hosting fixes exactly one of Tasos's complaints — vendor
unresponsiveness — and it fixes it by making Anadyon the vendor. That is a good
trade only for someone who wants to be the vendor. The frustration with Papaki
is about *having to operate infrastructure at all*; self-hosting is more of it.

## 4b. DECIDED — Zoho, 24 October 2026

**Tasos created the Zoho account on 24 October.** That settles §4: real
mailboxes at roughly $12/mailbox/year rather than the free forwarding-and-relay
arrangement. This section is the migration's safety rail, written **before** any
DNS is touched.

### The one thing that must not break: booking confirmations

Staff mail and booking mail share a domain but **not a path**, and the
distinction is what makes this migration safe:

| | Staff replies (changing) | Booking confirmations (must not change) |
| --- | --- | --- |
| Sends through | Papaki → **Zoho** | **Resend**, unchanged |
| Envelope domain | `anadyon.gr` | **`send.anadyon.gr`** |
| SPF record consulted | the **root** record | **`send.anadyon.gr`'s own** record |
| DKIM key | Papaki's `default` → **Zoho's** | **`resend._domainkey.anadyon.gr`** |

**Because Resend's envelope is on the subdomain, the root SPF and the MX
records can both change without touching booking mail at all.** That is not
luck — it is the layout recorded earlier in `EMAIL-DELIVERABILITY.md`, where
the September investigation established that booking mail passes SPF on
`send.anadyon.gr` and DKIM as `d=anadyon.gr`.

**Three records must survive the migration untouched:**

```
resend._domainkey.anadyon.gr    TXT   p=MIGfMA0GCSqGSIb3…       ← Resend DKIM
send.anadyon.gr                 TXT   v=spf1 include:amazonses.com ~all
_dmarc.anadyon.gr               TXT   v=DMARC1; p=none; rua=…
```

**Delete or overwrite any of those and booking confirmations start failing
authentication** — silently, because `p=none` means receivers will not bounce
them. That is the failure this section exists to prevent.

### The root SPF needs editing, not replacing

Today: `v=spf1 +mx include:_spf.fastmail.gr -all`

- **`+mx`** authorises whatever the MX records point at. Once MX moves to Zoho
  this authorises **Zoho's inbound servers**, which are *not* the servers Zoho
  sends from — so `+mx` alone is **not** sufficient.
- **`include:_spf.fastmail.gr`** is Papaki's. It can go once nothing sends
  through them.
- **Zoho's own include must be added**, and the exact token depends on the
  **data region** the account was created in (`.eu` and `.com` differ).

**The region is the thing to confirm first**, because MX hostnames, the SPF
include and the DKIM selector all follow from it.

### Order of operations — MX last

1. **Verify the domain** in Zoho (a TXT or CNAME record).
2. **Create the mailboxes.**
3. **Publish Zoho's DKIM** record.
4. **Edit the root SPF** to add Zoho's include — keeping `-all`.
5. **Migrate existing mail** with Zoho's IMAP tool, *before* cutover, so
   nothing is stranded on Papaki.
6. **Change MX last.** This is the only irreversible-feeling step and the only
   one with a propagation window.
7. **Then** reconfigure or retire Gmail's *Send mail as*.
8. **Only after mail is confirmed working**, cancel the Plesk subscription —
   which closes E33 and E36 with it.

**Steps 1–5 change nothing about where mail arrives.** The cutover is step 6
alone, which is why it goes last.

### Verification at each stage

After step 4, and again after step 6: send to any Gmail address, open **Show
original**, and expect `SPF: PASS` and `DKIM: PASS with domain anadyon.gr`.
Separately, confirm a **booking confirmation** still shows the same — that is
the regression this section is guarding.

## 5. Needed from Tasos

1. **How many mailboxes?** Still the missing number, and the whole cost question.
2. **Which Resend plan is this project on?** Decides whether the free option's
   daily cap binds.
3. **The decision** — free interim, Zoho, or Google Workspace.

The migration itself is ordinary work: the DNS records are already documented,
which is the part that usually goes wrong.

## The Zoho cutover now has a deadline: January 2027 — added 26 October 2026

This document chose Zoho on 24 October as the better option. **It is now the
only option that does not cost money**, and it has a date on it.

Google's own documentation for *Send mail as*
(`support.google.com/mail/answer/22370`, read directly rather than from a search
summary) states:

> *"Starting January 2027, Gmail will no longer support the 'Send as' feature for
> third-party email addresses."*

and that the change *"does not affect Google Workspace aliases or other Gmail
addresses you own"*.

**`customerservice@anadyon.gr` is squarely in scope.** It is a third-party
address — hosted at Papaki, not a Gmail address and not a Workspace alias — sent
from a **consumer** `anadyon.gr@gmail.com` account. So the arrangement that
currently carries all office mail **stops working in about two months**, with no
action required by anyone to break it.

**What this changes, and what it does not.**

- **It does not change the choice.** Zoho was already chosen on the merits:
  cost, independence from Papaki, native DKIM.
- **It removes "do nothing" as an option**, which was previously tenable — the
  Gmail arrangement worked for years and the only live complaint was E34.
- **It demotes E34's Option A to a stopgap.** Repointing the Gmail alias at
  `mail.anadyon.gr:587` fixes Yahoo delivery and is still worth doing if mail
  must flow this week, but it buys roughly two months and no more, because the
  feature being repointed is the feature being withdrawn.
- **It gives the fallback a price.** If the cutover slips past January, the only
  way to keep sending as `anadyon.gr` from Google is **Google Workspace** on the
  domain — which would also fix E34 outright by giving the domain a real
  `google._domainkey`. That is a paid tier, so it is Tasos's under `AGENTS.md`
  (*money and contracts*), and it is the option this document assessed and did
  not choose.

**The order and the safety rail are unchanged** and are above: MX last, and
three records must survive the cutover —
`resend._domainkey.anadyon.gr`, the `send.anadyon.gr` SPF record, and
`_dmarc.anadyon.gr`. Booking mail goes through Resend and is the half that
currently works; breaking it to fix the half that does not would be a poor trade.

**Calendar note.** Google name no day in January. Treat **1 January 2027** as the
effective date and keep December clear, rather than discovering the precise date
from an outage. Tracked as **E38** in `docs/OPEN-ITEMS.md`.

### What exactly ends, and what staff keep — read from Google's scope page, 26 October 2026

The question that matters operationally is whether the office can still answer
customers as `customerservice@anadyon.gr`. **It can. What changes is the program
they do it in.** Read from
`support.google.com/mail/answer/17101213` (the scope article the *Send mail as*
page links to), not from the one-line notice.

**Ends in January 2027:**

- **Sending as a third-party address — on the web *and* in the mobile apps.**
  Verbatim: *"You will no longer be able to send mail from third-party email
  accounts in Gmail on the web or in the Gmail mobile apps."* **The phone is not
  a way round this**, which is worth stating because the earlier reading of a
  search summary suggested it might be.
- **Gmailify and POP fetching** from third-party accounts on the web
  (*"Check mail from other accounts"*).
- **Adding or syncing** a third-party account in Gmail on the web — *already*
  unavailable, not a future change.
- Google may **restrict new configurations** of these during a Q3–Q4 2026
  transition, so the window to set anything up in Gmail is effectively now or
  never.

**Survives, and staff lose less than it first appears:**

- **Reading** the mailbox in the Gmail mobile app: *"Access through the Gmail
  mobile app for Android, iPhone, and iPad will not change."* Android keeps
  accessing third-party mail over POP.
- **Mail already imported** stays in the mailbox.
- **IMAP/POP/SMTP from desktop clients** — Outlook, Thunderbird, Apple Mail —
  untouched, because that is not a Gmail feature.
- **Forwarding** from a third-party provider into Gmail still works.
- *Send as* for Workspace aliases and other Gmail addresses.

**The trap in that combination, and it is customer-facing.** Reading continues
while sending stops. So a member of staff can keep the mailbox visible in Gmail
after January 2027, hit reply, and have the reply go out as
**`anadyon.gr@gmail.com`** instead of `customerservice@anadyon.gr` — or fail.
Either way the customer sees something other than the company address. That is
a change to what a customer receives, so it is `DEFINING-STATEMENTS.md` §13
territory and must be a decision taken in advance, not a discovery in January.

**Google's own recommended alternatives**, in their order:

1. **The provider's own website or app** — for Anadyon, Zoho webmail or the Zoho
   Mail app. Sends natively as the address, with no *Send as* involved, so the
   January change simply does not apply.
2. **A desktop client over IMAP/SMTP** — Outlook, Apple Mail or Thunderbird
   pointed at Zoho. The closest thing to the current habit for anyone who wants
   one program holding several mailboxes.
3. **The Gmail mobile app** for *access* to third-party accounts — reading only,
   not sending as.
4. **Google Workspace** on the domain, which is the paid route and would also
   fix E34 outright.

Google also **cautions against third-party tools that replicate "Send as"**,
because they require handing over credentials or OAuth tokens. Worth recording
because such a tool will look like an easy fix and would hand a third party the
mailbox's password.

**So the staff-workflow consequence, plainly.** After the cutover the office
answers customer mail **in Zoho** — browser or app — or in a desktop client
pointed at Zoho. They keep the address, the history and the signature; they lose
having it inside the same Gmail inbox as `anadyon.gr@gmail.com`. Whether that is
acceptable, and whether anyone needs a desktop client set up rather than
webmail, is an operating decision for Tasos under §13 rather than an agent's.
