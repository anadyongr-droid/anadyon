# How Anadyon's email actually leaves the building

**Last verified:** 21 October 2026, Claude — **PHP exposure section added, on the day PHP shipped emergency fixes for two CVSS 9.2 unauthenticated-RCE flaws (CVE-2026-109618, CVE-2026-109619).** This project has no PHP in the application, the public website or Supabase, and the three `php` strings in the repository are competitors' endpoints we fetch **from**. The exposure is the Papaki/Plesk server `213.158.90.117`, which serves `mail.anadyon.gr` and `webmail.anadyon.gr` and is itself a PHP application with Roundcube webmail — **its PHP version is unverified from here** and the three things needed are Tasos's (E33). Earlier: 19 September 2026, Claude — from live DNS *and* from the full
headers of a delivered message. Two conclusions from the 11 September pass were
withdrawn; both had reasoned from DNS alone where only a header could answer.

There are **two entirely separate sending paths**, and confusing them wastes a
diagnosis. A failure on one says nothing about the other.

| | Booking system | Office mailbox |
|---|---|---|
| Sends | Quote and booking confirmations, admin notices | Staff replying as `customerservice@anadyon.gr` |
| Through | **Resend** (Amazon SES infrastructure) | **`relay12.grserver.gr`** — `88.99.38.195` |
| Code | `lib/mailer.ts`, `lib/bookingEmails.ts` | None — it is a mailbox, not the app |
| From | `Anadyon Rentals <customerservice@anadyon.gr>` | same address |

Both send **as the root domain**, which is why the root domain's DNS has to
authorise both and currently does not.

## The DNS, as it stands

```
anadyon.gr           MX   10 mail.anadyon.gr        → 213.158.90.117 (linux207.papaki.gr)
anadyon.gr           TXT  v=spf1 +mx include:_spf.fastmail.gr -all
_dmarc.anadyon.gr    TXT  v=DMARC1; p=none; rua=mailto:customerservice@anadyon.gr; fo=1
resend._domainkey    TXT  p=MIGfMA0GCSqGSIb3…            ← Resend DKIM, on the ROOT domain
send.anadyon.gr      TXT  v=spf1 include:amazonses.com ~all
send.anadyon.gr      MX   10 feedback-smtp.eu-west-1.amazonses.com
```

**The office relay is properly authorised.** `88.99.38.195` appears explicitly in
`_spf1.fastmail.gr`, reached through the `_spf.fastmail.gr` include, and its
reverse DNS resolves correctly to `relay12.grserver.gr`. Nothing is misconfigured
on that path.

**~~Resend is not authorised by SPF.~~ — WITHDRAWN 19 September 2026.**

This section previously said the root record's `-all` meant every booking
confirmation hard-fails SPF and passes DMARC on DKIM alone. That reasoning was
wrong, and it is left visible rather than deleted because it is an easy mistake
to make twice: **SPF is evaluated against the envelope sender (Return-Path), not
the `From:` header.** The root record governs mail whose Return-Path is the root
domain. Resend's is almost certainly not.

The evidence, all from live DNS above:

- `send.anadyon.gr` carries `v=spf1 include:amazonses.com ~all` — exactly what a
  Return-Path domain needs.
- `send.anadyon.gr` holds the SES **feedback MX**. A feedback MX exists only to
  receive bounces for the Return-Path domain. The root MX is the Papaki mailbox,
  not a feedback host.
- Resend's documentation: *"If you have a verified domain with Resend, it means
  you are already passing SPF and DKIM."*

On that reading booking mail passes **both**: SPF for `send.anadyon.gr`, which
relaxed-aligns with `anadyon.gr` as the same organisational domain; and DKIM as
`d=anadyon.gr`, which strict-aligns with the `From:` header. `send.anadyon.gr`
is therefore not "half-configured" either — the split is Resend's standard
layout, envelope on the subdomain and DKIM on the root where it aligns.

**Measured 19 September 2026, and confirmed.** Full headers of a live quote
notification sent 18 September. At the first hop, where Papaki receives straight
from SES:

```
Received-SPF: pass (linux207.papaki.gr: domain of send.anadyon.gr
             designates 54.240.3.27 as permitted sender)
             envelope-from=…@send.anadyon.gr
Authentication-Results: linux207.papaki.gr;
             dmarc=pass (p=NONE sp=NONE) smtp.from=send.anadyon.gr header.from=anadyon.gr;
             dkim=pass header.d=anadyon.gr; spf=pass (sender IP is 54.240.3.27)
```

The envelope is `send.anadyon.gr`, SPF passes against it, DKIM passes as
`d=anadyon.gr`, DMARC passes. **Nothing was ever broken. E4 is closed.**

The root record does its own separate job, which the same message shows. When
the mailbox forwards on, the Papaki relay applies SRS and rewrites the envelope
to the root domain — `SRS0=…=send.anadyon.gr=…@anadyon.gr` — and Google then
checks *that* against the root record, where `88.99.38.195` is authorised
through the fastmail include. It passes. So the root SPF is already correct for
the traffic that actually uses it, and adding `include:amazonses.com` would have
done nothing for booking mail while authorising every Amazon SES customer on the
shared pool to send as `anadyon.gr`.

**~~`send.anadyon.gr` is half-configured and unused.~~ — WITHDRAWN 19 September
2026, same misreading.** It has no DKIM key because it does not need one: DKIM
signs as the `From:` domain, which is the root, and that is where the key is.
The subdomain carries the envelope and the bounce path. That is Resend's normal
layout, not an unfinished setup.

## Korean customers: reply through the system, not from the mailbox

**Workaround for E5, until grserver gets the relay delisted.**

The two sending paths have different reputations, and only one of them is
blocked. Booking mail leaves through **Amazon SES** (`54.240.3.27` on the
measured message); staff replies leave through **`relay12.grserver.gr`**
(`88.99.38.195`), which is the address Naver refuses.

So for a customer on `naver.com` — or any Korean provider — a reply typed in the
mailbox bounces, while mail the system sends may well arrive. **Expected, not
verified:** nobody has confirmed a delivery from SES to Naver, and the two are
separate enough that it should not be assumed. What *is* verified is that the
mailbox path is refused.

Practically, until E5 clears:

1. Answer through the system's own email where one exists, rather than replying
   from the mailbox.
2. Otherwise use the phone number on the request — Korean bookings have carried
   a `+82` mobile — or WhatsApp.
3. Do not assume a reply was received because it did not visibly bounce; a `421`
   bounce lands in the mailbox, not in front of the person who typed the reply.

This is live, not theoretical: a quote request from a `naver.com` address arrived
on **18 September for a next-day pick-up**. Any reply from the mailbox would have
been refused and the customer would simply have heard nothing.

## The Naver block, 11 September 2026

A message to a `naver.com` address bounced with:

```
host mx4.mail.naver.com refused to talk to me:
421 4.3.2 Your ip blocked from this server.   ref VPdBxVRJReWvU4oJvox9JA
```

**Not a configuration fault, and not fixable from this repository.** `421` is
refused at connection time, before authentication is offered, so SPF, DKIM and
message content play no part. Naver has blocked the **shared** relay IP that
grserver uses for many customers — `88.99.38.195` sits in a Hetzner range, which
Korean providers block broadly.

Only the host can request delisting, because only the host controls the IP.
Open item **E5**.

**Booking confirmations were unaffected**, because they never touch that relay.

## The Plesk certificate, 12 September 2026

Papaki reported Let's Encrypt renewal failing for `Lets Encrypt anadyon.gr`,
covering `anadyon.gr` and `*.anadyon.gr`, 29 days to expiry.

**Vercel is not involved and needs nothing.** `anadyon.gr` and `www` resolve to
`76.76.21.21`, and Vercel issues and renews that certificate itself.

**The Plesk certificate is the Papaki server's**, and its wildcard is what
secures `mail.anadyon.gr` — staff IMAP, SMTP and webmail. That part matters.

**Why it fails, inferred from DNS rather than observed:** Let's Encrypt validates
`anadyon.gr` over HTTP-01, and that request now lands on Vercel, so Plesk can
never satisfy it. The site moved; the certificate request did not. The wildcard
half needs DNS-01 and an `_acme-challenge` TXT record, which is absent — though
that record only exists transiently during validation, so its absence is not
proof on its own.

**The fix** is to reissue in Plesk for only the hostnames still on that server —
`mail.anadyon.gr` and the webmail/panel host — dropping `anadyon.gr` and the
wildcard. Open item **E6**.

**Not verifiable from this environment.** The egress proxy re-terminates TLS, so
`openssl s_client` returns the proxy's own certificate for any host, not the
real one. Confirming what that certificate is bound to takes one look at Plesk.

## PHP exposure, and the 21 October 2026 critical PHP release

*Asked by Tasos on 21 October: "we don't have anywhere any PHP exposure right?"
The answer is not a flat no, and this section exists so the next person asking
gets the whole shape rather than the reassuring half of it.*

**The advisory.** PHP shipped emergency fixes on **21 October 2026** for
**CVE-2026-109618** and **CVE-2026-109619**, rated **CVSS v4.0 9.2**:
unauthenticated remote code execution in the core runtime, plus memory
disclosure. Fixed in **8.5.12, 8.4.27, 8.3.36 and 8.2.35**; everything from
PHP 5.4 up to 8.5.11 is listed vulnerable. Public proof-of-concept exploits
exist and large-scale exploitation is expected, though no active exploitation
was reported as of that date. 8.1 and earlier are end of life — Google Cloud
says no fix ships for them; another source says source patches exist. Either
reading means the same thing: an 8.1-or-older server needs upgrading, not
patching.

### Where this project has no PHP at all

- **The application.** No `.php` file, no `composer.json`, no PHP dependency.
  Next.js and TypeScript on Vercel, which runs Node.
- **The public website.** `anadyon.gr` and `www` resolve to `76.76.21.21`
  (Vercel). A visitor-facing PHP compromise of the website is not possible,
  because there is no PHP in front of a visitor.
- **Supabase.** PostgreSQL and PostgREST; no PHP in the data plane.

### The three `php` strings in the repository are outbound, and are not exposure

`lib/farosRates.ts` posts to `includes/ajax.php` and `lib/competitorRates.ts`
builds `vehicle.results.php` URLs. Those are **competitors' endpoints**, fetched
as a client through `lib/boundedFetch.ts`. Their PHP version is their business.

Worth stating the second-order case rather than leaving it implied: if a
competitor's PHP site were compromised, our scraper would fetch
attacker-controlled HTML. That is a parsing-robustness question for a Node
process, not a path to running PHP here, and the fetch is already bounded. Not
a finding; recorded so the next reader does not have to re-reason it.

### Where the exposure actually is

**The Papaki/Plesk server, `213.158.90.117`.** Both `mail.anadyon.gr` and
`webmail.anadyon.gr` resolve to it (checked 21 October 2026). **Plesk is itself
a PHP application and its webmail is Roundcube, also PHP** — so that host is an
internet-facing PHP surface, and it carries staff mail.

Nothing about the website's move to Vercel changed this. The certificate section
above is about the same server for the same reason: it is still there, still
serving, and still the part of this estate that an agent cannot see inside.

**The version is unverified and is deliberately not guessed (§8).** The same
limit as the certificate: this environment's egress proxy re-terminates TLS, so
`curl -I` returns only the proxy's `200 Connection Established` and a WebFetch
of the webmail host returned `503`. No banner, no version, no conclusion.

### What is needed, and it needs Tasos

Three things, in order, none of which an agent can do:

1. **Ask Papaki whether they patch PHP on this plan, naming the two CVEs.** If
   it is managed shared hosting they do it; if it is a VPS, nobody has yet.
   That single question decides whether anything else on this list is urgent.
2. **In Plesk → Tools & Settings → Updates**, read the PHP version actually
   serving, and the Plesk build. Anything **below 8.2.35, 8.3.36, 8.4.27 or
   8.5.12** needs the update; anything on **8.1 or older** needs a version
   upgrade instead.
3. **Check what else that server still serves.** The website moved to Vercel but
   the old document root may not have been emptied. A leftover PHP site nobody
   uses is the worst version of this, because nobody is watching it.

**Also worth asking Papaki about while there:** Roundcube's own August 2026
emergency release fixed a **pre-authentication IMAP command injection** needing
no credentials. Whether that reached this Plesk build is unverified here.

### What does not need doing

Nothing on Vercel, nothing in Supabase, nothing in this repository, and no
migration. The application is not affected by a PHP CVE because it contains no
PHP.

## Before diagnosing the next bounce

1. **Which path?** A bounce naming `grserver.gr` is the office mailbox. A
   delivery problem reported by the app or the Resend webhook is the other path.
2. **`4xx` is temporary and retried; `5xx` is permanent.** The warning above was
   a delay notice, not a failure.
3. **A `421 … ip blocked` is never an SPF or DKIM problem.** It happens before
   either is presented.
4. **A health check now watches the SPF record**, including whether it
   authorises the services that actually send — `spfProblems()` in
   `lib/healthChecks.ts`, reported in the daily briefing. It exists because its
   predecessor passed while Resend was unauthorised.
5. DNS can be read from here without `dig`, which is not installed:
   `curl -sS -H "accept: application/dns-json" "https://dns.google/resolve?name=anadyon.gr&type=TXT"`


## Both sending paths are DKIM-signed and aligned — 19 September 2026

Relevant to **E9**, whether DMARC can move off `p=none`.

| Path | Selector | Signs as | Aligns with `From:` |
|---|---|---|---|
| Booking mail (Resend/SES) | `resend._domainkey.anadyon.gr` | `d=anadyon.gr` | strict ✓ |
| Office mailbox (Papaki relay) | `default._domainkey.anadyon.gr` | `d=anadyon.gr` | strict ✓ |

Both selectors are published and both validated on the measured message
(`dkim=pass header.i=@anadyon.gr header.s=default`). Papaki signs for the vhost
on the way out, which is what the earlier note recorded as unverified.

**This is better news for E9 than expected, and still not sufficient.** The
message measured was one Papaki *forwarded*, not one a staff member *originated*
from the mailbox. The signing setup is per-vhost and almost certainly identical
for both, but "almost certainly" is how the SPF finding went wrong. Read the
`rua` aggregate reports before tightening; they cover every source, including the
ones nobody has thought of.


## DMARC reports read — 19 September 2026. **Do not tighten yet.**

The reports that answer **E9** had been arriving daily and being deleted unread.
Twenty-plus were found in the Gmail bin, 21 August to 17 September, from five
receivers. Gmail purges its bin after 30 days, so the August ones are days from
being lost.

Three have now been read — Google, GMX and Outlook.com — kept at `docs/dmarc/`
and parsed with `npm run check:dmarc`:

| Source IP | rDNS | Msgs | SPF aligned | DKIM aligned |
|---|---|---|---|---|
| `78.46.171.57` | relay11.grserver.gr | 2 | pass | pass |
| `2a01:4f8:1c1b:b0af::1` | relay11.grserver.gr | 1 | pass | pass |
| `2a01:4f9:c013:30d8::1` | relay14.grserver.gr | 1 | pass | pass |
| `46.62.234.254` | relay15.grserver.gr | 1 | pass | pass |
| **`209.85.220.41`** | **mail-sor-f41.google.com** | **1** | **FAIL** | **FAIL** |

**Four of the five sources are the office mailbox relays, and all four pass.**
grserver uses a pool — relay11, 14 and 15 all appear, over IPv4 and IPv6 — and
every one authenticates: SPF on the root record through `include:_spf.fastmail.gr`,
DKIM on the `default` selector, both aligned with the `From:` header.

**The fifth is the answer to E9, and it is no.** `mail-sor-f41.google.com` is a
**Gmail forwarder**, and its message failed DMARC outright. Its `auth_results`
show SPF passing for `gmail.com` — which does not align with `anadyon.gr` — and
**no DKIM result at all**, meaning no signature survived the forward.

That is the classic forwarding break, and it is not hypothetical here:
`customerservice@anadyon.gr` forwards to `anadyon.gr@gmail.com`, so mail crossing
that hop is exactly what this record describes.

**Under `p=quarantine` that message would have gone to spam.** One failing
source in the first three reports ever read is reason enough to stop, and the
right response is not to force it through:

1. **Collect a week or two** across all five receivers before deciding. Three
   reports covering six messages is a sample, not a picture.
2. **Establish what that forwarded mail actually is.** If it is only the
   mailbox's own forward to Gmail, the blast radius is internal and tolerable.
   If customers are reached that way, it is not.
3. **If tightening, ramp with `pct=`** — `p=quarantine; pct=10` affects a tenth
   of failing mail and the reports show the effect before it is universal.

E9 stays open, better informed rather than answered.
