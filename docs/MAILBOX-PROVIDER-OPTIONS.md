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

## 5. Needed from Tasos

1. **How many mailboxes?** Still the missing number, and the whole cost question.
2. **Which Resend plan is this project on?** Decides whether the free option's
   daily cap binds.
3. **The decision** — free interim, Zoho, or Google Workspace.

The migration itself is ordinary work: the DNS records are already documented,
which is the part that usually goes wrong.
