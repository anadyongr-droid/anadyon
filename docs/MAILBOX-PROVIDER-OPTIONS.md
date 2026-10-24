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

## 5. Needed from Tasos

1. **How many mailboxes?** Still the missing number, and the whole cost question.
2. **Which Resend plan is this project on?** Decides whether the free option's
   daily cap binds.
3. **The decision** — free interim, Zoho, or Google Workspace.

The migration itself is ordinary work: the DNS records are already documented,
which is the part that usually goes wrong.
