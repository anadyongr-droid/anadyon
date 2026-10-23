# How Anadyon's email actually leaves the building

**Last verified:** 23 October 2026, Claude — **Yahoo is blocking mail sent from Gmail as `anadyon.gr`, and it is the office mail setup rather than anything this repository deploys.** The sending IP `209.85.218.42` is Google — a fourth sending path beside Resend, the grserver relay and the Papaki host — and **nothing in this repository can send through Gmail**: `lib/gmail.ts` is read-only and `lib/mailer.ts` is Resend. Live DNS re-read today: SPF authorises `+mx` and fastmail and **nothing Google**, ending `-all`; there is no `google._domainkey`; but **`default._domainkey` exists**, so Papaki already signs. The fix is one Gmail setting — send that alias through `mail.anadyon.gr` instead of through Google — after which SPF and DKIM both pass with no DNS change at all (E34). Booking mail is unaffected. Earlier: 21 October 2026, Claude — **PHP exposure section added, on the day PHP shipped emergency fixes for two CVSS 9.2 unauthenticated-RCE flaws (CVE-2026-109618, CVE-2026-109619).** This project has no PHP in the application, the public website or Supabase, and the three `php` strings in the repository are competitors' endpoints we fetch **from**. The exposure is the Papaki/Plesk server `213.158.90.117`, which serves `mail.anadyon.gr` and `webmail.anadyon.gr` and is itself a PHP application with Roundcube webmail — **its PHP version is unverified from here** and the three things needed are Tasos's (E33). Earlier: 19 September 2026, Claude — from live DNS *and* from the full
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

### The attack vector, read 21 October — and it makes the webmail answer worse

*Added after Tasos asked the right follow-up: "so for the webmail we are
exposed?" The first version of this section said the version was unverified and
left it there. That was true and not enough, because the vector decides whether
a login page is a sufficient attack surface. It is.*

From CERT-EU advisory 2026-018:

- **CVE-2026-109619** — stale per-request global state surviving after its
  backing memory is freed. A demonstrated exploit in which **"one
  unauthenticated request can trigger the attack before any application code
  runs."**
- **CVE-2026-109618** — memory corruption during an out-of-memory error:
  `memory_limit` is enforced with `longjmp()`, which can interrupt request
  parsing while internal data is only partly initialised, after which cleanup
  frees memory that was never initialised and may hold attacker-controlled
  data. Form-based file upload parsing is the advisory's example.
- **Prerequisites for both: "any PHP installation serving web requests"** —
  PHP-FPM, Apache `mod_php`, `php-cgi`, FrankenPHP, LiteSpeed. The PHP team
  considers `mod_php` the highest risk.
- **No authentication and no user interaction.**

**Three consequences for `webmail.anadyon.gr` specifically.**

1. **The login page is enough.** Nobody has to sign in, and no Roundcube
   feature has to be reachable. The flaw is in the runtime underneath, and
   109619 lands *before application code runs*.
2. **"Unverified version" is no longer a neutral answer.** The fixes were
   published on **21 October 2026** — the same day. Every release from PHP 5.4
   to 8.5.11 is affected, so **any server not patched within hours of the
   release is running a vulnerable version by definition.** The honest
   statement is therefore not "we do not know whether we are exposed" but
   "we are exposed unless Papaki patched today, and that is the thing to
   confirm."
3. **Mail itself is not PHP, and that is the useful part.** IMAP, SMTP and
   delivery are Postfix and Dovecot — no PHP in the path. Only two things on
   that server are PHP: **Roundcube webmail** and **the Plesk panel**. So the
   attack surface can be removed without interrupting mail, by having staff use
   a desktop or phone mail client over IMAP while webmail is off.

### Mitigations if Papaki cannot patch immediately

From the same advisory, and **all of them are partial — only the update fixes
it**:

- `session.upload_progress.enabled=0` in `php.ini` or the FPM pool, **then
  restart every worker**. Not via `ini_set()` or `.user.ini`, which are too
  late. (109619)
- `memory_limit=-1` set so applications cannot override it — `php_admin_value`.
  (109618)
- A low `post_max_size` — 8M, or 32M if uploads are needed — with
  `upload_max_filesize` below it. (109618)
- On PHP 8.5, `fatal_error_backtraces=0`, then restart workers.
- Request size, field, part, header and nesting limits at the web server.
- A container or cgroup memory limit. **Not** `RLIMIT_AS` or `RLIMIT_DATA`.
- The advisory's own last resort: *"isolate internet-facing PHP applications
  from public networks until the fix is applied and verified."* Here that means
  turning webmail off, or restricting it to known addresses, and leaving staff
  on IMAP.

**PHP 8.1 and older:** minimal backports exist for 7.4, 8.0 and 8.1 for builds
from source, but a distribution or vendor build needs the vendor. Upgrading to
a supported branch is the real answer.

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

### Paste-ready, for Papaki

Greek first, since that is the support channel. Both versions ask the same four
questions, and question 3 is the one that decides everything else.

```
Θέμα: Επείγον — PHP 21/10/2026 security release (CVE-2026-109618 / CVE-2026-109619)

Καλημέρα σας,

Σχετικά με τον server που φιλοξενεί το anadyon.gr (mail.anadyon.gr /
webmail.anadyon.gr, 213.158.90.117):

Στις 21/10/2026 το PHP εξέδωσε επείγουσες διορθώσεις για δύο κρίσιμα κενά
ασφαλείας, CVE-2026-109618 και CVE-2026-109619 (CVSS 9.2, unauthenticated
remote code execution). Επηρεάζονται όλες οι εκδόσεις από 5.4 έως 8.5.11.
Διορθωμένες εκδόσεις: 8.5.12, 8.4.27, 8.3.36, 8.2.35.

Παρακαλώ επιβεβαιώστε:

1. Ποια έκδοση PHP τρέχει ο server αυτή τη στιγμή;
2. Έχει εφαρμοστεί η ενημέρωση της 21/10/2026; Αν όχι, πότε θα εφαρμοστεί;
3. Είναι η ενημέρωση δική σας ευθύνη στο πακέτο που έχουμε, ή δική μας;
4. Έχει ενημερωθεί το Roundcube webmail για το κενό ασφαλείας του
   Αυγούστου 2026 (pre-authentication IMAP command injection);

Μέχρι να επιβεβαιωθεί η ενημέρωση, θα θέλαμε να απενεργοποιηθεί προσωρινά
το webmail (ή να περιοριστεί η πρόσβαση σε συγκεκριμένες IP). Το προσωπικό
θα χρησιμοποιεί IMAP από mail client, που δεν επηρεάζεται.

Ευχαριστώ,
Τάσος Μαρούδας
Anadyon
```

```
Subject: Urgent — PHP security release 21/10/2026 (CVE-2026-109618 / CVE-2026-109619)

Hello,

Regarding the server hosting anadyon.gr (mail.anadyon.gr /
webmail.anadyon.gr, 213.158.90.117):

On 21 October 2026 PHP released emergency fixes for two critical
vulnerabilities, CVE-2026-109618 and CVE-2026-109619 (CVSS 9.2,
unauthenticated remote code execution). All versions from 5.4 to 8.5.11 are
affected. Fixed versions: 8.5.12, 8.4.27, 8.3.36, 8.2.35.

Please confirm:

1. Which PHP version is this server currently running?
2. Has the 21 October 2026 update been applied? If not, when will it be?
3. On our plan, is applying it your responsibility or ours?
4. Has Roundcube webmail been updated for the August 2026
   pre-authentication IMAP command injection?

Until the update is confirmed, we would like webmail temporarily disabled,
or access restricted to specific IP addresses. Staff will use IMAP from a
mail client, which is unaffected.

Thank you,
Tasos Maroudas
Anadyon
```

**Turning webmail off is Tasos's call, not an agent's.** It changes how staff
work, which `DEFINING-STATEMENTS.md` §13 reserves to him; this is the proposal
and the reasoning, not a decision taken. It is also reversible in a click,
which is why it is worth proposing rather than waiting for a version number.

### What does not need doing

Nothing on Vercel, nothing in Supabase, nothing in this repository, and no
migration. The application is not affected by a PHP CVE because it contains no
PHP.

## Yahoo blocks mail sent from Gmail as `anadyon.gr` — 23 October 2026

*A `550 5.7.9` from Yahoo, reported by Tasos with the question "could this be
linked to something not working on our side?" The short answer is **no, not the
booking system** — and yes, something is genuinely misconfigured, in the office
mail setup rather than in anything this repository deploys.*

**The bounce:**

> `550 5.7.9 This message has been blocked because the sender has not been
> authenticated. Yahoo requires this sender to be authenticated with DKIM. SPF
> alone is not sufficient. Authentication results: DKIM = FAILURE — SPF
> anadyon.gr with ip 209.85.218.42 = FAILURE.`

### The sending IP identifies the path, and it is a fourth one

**`209.85.218.42` is Google.** It is none of the three paths this document
already describes:

| Path | IP seen in evidence | What it carries |
| --- | --- | --- |
| Resend / Amazon SES | `54.240.3.27` | booking confirmations |
| grserver relay (Papaki) | `88.99.38.195` | staff replies from the mailbox |
| Papaki mail host | `213.158.90.117` | `mail.anadyon.gr`, IMAP/SMTP |
| **Google** | **`209.85.218.42`** | **this bounce** |

### It is not the application, and that is checkable rather than asserted

**Nothing in this repository can send mail through Google.** `lib/gmail.ts`
exports `createOAuthClient`, `getAuthUrl`, `getStoredTokens`, `saveTokens`,
`getGmailClient`, `parseFromHeader`, `htmlToText`, `listAttachments` and
`fetchAttachment` — **every one of them a read.** There is no send function,
and a search across `lib/`, `app/` and `scripts/` for a Gmail send call returns
only the column name `gmail_thread_id`. The application's one sending path is
`lib/mailer.ts`, which is Resend.

So this message was composed **by a person in Gmail**, using Gmail's *"Send
mail as"* with an `@anadyon.gr` address, and sent through Google's servers.

### Why Yahoo refused it — both checks fail, and they fail for different reasons

Live DNS, read 23 October 2026 (the records in this document above were last
read on 19 September, so they were re-read rather than assumed):

```
anadyon.gr                    TXT   v=spf1 +mx include:_spf.fastmail.gr -all
_dmarc.anadyon.gr             TXT   v=DMARC1; p=none; rua=mailto:customerservice@anadyon.gr; fo=1
anadyon.gr                    MX    10 mail.anadyon.gr.
default._domainkey.anadyon.gr TXT   v=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…   ← EXISTS
google._domainkey.anadyon.gr  TXT   (none)
```

- **SPF fails** because the record authorises `+mx` (the Papaki host) and
  `_spf.fastmail.gr`, and **nothing Google**. The record ends `-all`, a hard
  fail, so Google's IP is positively unauthorised rather than merely unlisted.
- **DKIM fails** because Gmail signs outgoing mail as the Google account's own
  domain, not as `anadyon.gr`, and no `google._domainkey.anadyon.gr` exists to
  let it do otherwise. Yahoo requires a signature whose `d=` aligns with the
  `From:` domain.
- Yahoo's message is explicit that **SPF alone is not sufficient**, so
  authorising Google in SPF would not by itself fix this.

### The fix is one setting, because the domain already has a DKIM key

**`default._domainkey.anadyon.gr` is published** — the `default` selector is
Plesk's, so the Papaki server already has DKIM signing set up for this domain.
Mail that leaves through Papaki is therefore signed as `anadyon.gr` **and**
authorised by `+mx`.

So the correction is to stop routing that alias through Google:

**Gmail → Settings → Accounts and Import → "Send mail as" → edit the
`@anadyon.gr` address → choose "Send through `anadyon.gr` SMTP servers"**, with
`mail.anadyon.gr`, port 587, the mailbox username and password, TLS.

After that the same message leaves via Papaki, SPF passes on `+mx`, and DKIM
signs with the `default` selector. Both of Yahoo's requirements are met by
configuration that already exists.

**The alternative needs Google Workspace and is worse.** Keeping the Google
route means adding `include:_spf.google.com` to SPF *and* enabling Google's DKIM
for the domain — and **Google only signs for a domain on Workspace, not on a
free Gmail with a send-as alias.** Adding the SPF include alone would authorise
Google while leaving DKIM failing, which Yahoo rejects anyway, and would widen
`-all` for no benefit.

**How to verify, in thirty seconds and without waiting for another bounce:**
send one message from the alias to any Gmail address, open it, choose **Show
original**, and read the header block. Expect `SPF: PASS` and
`DKIM: PASS with domain anadyon.gr`. Anything else means the SMTP setting did
not take.

### "Why now?" — the question that matters, and it is not fully answered

*Tasos, 23 October: "I simply responded from the Gmail of Anadyon on a quote
request email. I have done this several times since we went live back in August
and we never had an issue. Why all of a sudden?"*

**Ruled out: Yahoo did not change anything.** The `550 5.7.9`
"sender is unauthenticated" rejection dates from **May 2024** and has applied
since. There is no October 2026 policy change — searched, and none of the
vendor or community sources describes one. So "Yahoo tightened" is not the
explanation.

That leaves two, and they call for different actions:

1. **Nothing changed; only the recipient did.** The Google path has failed SPF
   and DKIM since August, but Gmail, Outlook and most corporate filters do not
   *hard-reject* an individual sender for it — they accept, and may file it as
   spam. **Yahoo rejects.** On this reading the problem is two months old and
   today is simply the first Yahoo address. The uncomfortable corollary:
   **some earlier replies may have been silently spam-filed**, which the sender
   never sees.
2. **The route changed around 13 October.** If the alias had been relaying
   through `mail.anadyon.gr`, both checks would have passed — SPF on `+mx`,
   DKIM on the published `default` selector. **E6's certificate for
   `anadyon.gr` and `*.anadyon.gr` was due to expire around 13 October 2026**,
   ten days before this bounce, and it was never reissued. An expired
   certificate breaks an SMTP relay that requires TLS.

**The attempt to settle it from the mailbox failed, and the failure is
recorded rather than dressed up.** `scripts/sql/readonly/bounce-history.sql`
counts delivery-failure messages per month against total mail per month, which
would separate the two: earlier bounces support reading 1, a clean record
before October supports reading 2. Run against production (**40014211739**) it
returned one row:

```
      section      |  month  | sender_domain | messages
-------------------+---------+---------------+----------
 all mail by month | 2026-08 | (any sender)  | 48
```

**There is no September or October mail in the table at all**, so the query
has nothing to measure and the question stays open from this direction. That
is a finding in itself — see the next section.

**What does settle it, in ten seconds, and only Tasos can look:** Gmail →
Settings → Accounts and Import → **Send mail as** → the `@anadyon.gr` entry.

- If it says **"Send through Gmail"** → reading 1. It has always been this way,
  the fix is the SMTP change above, and it is worth checking whether earlier
  replies reached people.
- If it is configured for **`mail.anadyon.gr` SMTP**, and especially if Gmail
  shows an error or has reverted it → reading 2, and **E6 is the root cause**,
  which makes that certificate urgent rather than cosmetic.

### A Yahoo message a few days ago did not bounce — what that does and does not prove

*Tasos, 23 October, checking rather than accepting the explanation: "A few days
ago I sent an email to yahoo.com that didn't bounce back."*

**It weakens reading 1 but does not kill it, and the distinction is the whole
point.** "Did not bounce" means Yahoo **accepted the message at SMTP**. It does
not mean the message reached an inbox: an accepted message can still be filed
as spam, and the sender sees nothing either way. So a silent delivery and a
silent spam-filing look identical from here.

**What it does establish** is that Yahoo is not rejecting every message from
this sender uniformly, so *something differs between the two messages*. The
candidates, in the order worth checking:

1. **A different `From` alias.** Gmail picks the sending address on a *reply*
   from the address the original was addressed to. If Anadyon has more than one
   address and only some are configured to relay through `mail.anadyon.gr`,
   two replies take two different routes with two different outcomes — and the
   sender does nothing differently in either case. **This is the most likely
   explanation and the easiest to check.**
2. **A change on the Papaki server in the last 48 hours.** On 21 October this
   project told Tasos to press Papaki about the PHP release (E33), including a
   request to disable or restrict webmail. **If Papaki patched, restarted mail
   services, or changed the configuration in response, that is a change to the
   sending path dated between the message that worked and the one that did
   not.** Worth asking them directly; it would be an unwelcome irony, not a
   reason to have left the server unpatched.
3. **Recipient-side reputation.** Yahoo treats a recipient who has corresponded
   with the sender before more leniently than a cold one.

**What settles it, and it is a comparison rather than a theory:** open Gmail's
**Sent** folder, find both messages — the Yahoo one from a few days ago that
went through, and today's that bounced — and run **Show original** on each.
Three lines decide it:

| Header | What it tells you |
| --- | --- |
| `From:` | whether the two replies used the **same alias**. Different aliases → explanation 1, and only one of them is configured correctly. |
| `Received:` / `Return-Path` | whether one left via **`mail.anadyon.gr`** and the other via **Google**. Different paths → the route is per-alias or it changed. |
| `DKIM-Signature: d=` | whether either carried **`d=anadyon.gr`**. Present on the one that worked and absent on the one that failed is the complete answer. |

**Not verified, and recorded as such (§8):** an attempt to date the Plesk
certificate from public Certificate Transparency logs failed —
`crt.sh` returned HTTP 502 on 23 October. So whether E6's certificate expired
around 13 October, and whether anything has been issued since, is still
unestablished from this environment. It is visible in Plesk in one look.

## The email intelligence pipeline has ingested nothing since August

**Found 23 October 2026 while looking for bounces, and it is unrelated to the
Yahoo question except that it is why that question could not be answered.**

`public.emails` holds **48 rows, every one from August 2026**. Nothing in
September. Nothing in October.

**The code is still wired in and still running.** `app/api/cron/morning-briefing/route.ts`
imports and calls all three stages every morning —

```
const sync     = await withBudget("email sync", 25_000, () => syncEmails({ budgetMs: 20_000 }));
const replies  = await withBudget("reply detection", 10_000, detectReplies);
const watchdog = await withBudget("watchdog", 5_000, runWatchdog);
```

— `lib/emailSync.ts` still writes to `public.emails`, and the cron itself is
demonstrably alive: `alert_outbox` carries **64 `briefing:` rows, the newest
dated today**.

**So the cron runs every morning, calls the sync, and stores nothing.**

The `alert_outbox` reading taken on 20 October said the same thing and it was
not noticed at the time, which is worth admitting because the data was already
in hand:

| prefix | newest row | reading |
| --- | --- | --- |
| `briefing` | **2026-10-20** | alive |
| `watchdog` | 2026-08-21 | stopped |
| `urgent` | 2026-08-22 | stopped |
| `booking-confirmation` | 2026-08-23 | stopped |

Three of the four stopped within three days of each other in late August.

**What this costs.** The watchdog exists to notice a customer email nobody has
answered, and `urgency` drives the immediate alert. Both have been blind for
two months. A quote request that went unanswered in that window would have
produced no alert at all — which is the same inert-control failure this project
has now found several times, and the reason the fingerprint and the backup
inventory were built.

**Likeliest causes, none verified:** the Gmail OAuth token has expired or been
revoked and `getGmailClient()` fails silently inside the budget wrapper; the
25-second budget is exhausted every run; or the connection was deliberately
removed. `system_settings` holds the stored tokens and the cron's own
`console.info` output would say which — neither readable from here. Raised as
**E35**.

### Why the SPF health check did not catch this

`lib/healthChecks.ts` watches the SPF record, and it is working as designed.
`SPF_SENDERS` lists the services known to send as this domain — currently
Resend, with tokens `amazonses.com`, `spf.resend.com`, `_spf.resend.com` — and
the check asserts those tokens are present.

**Google was never declared as a sending path, so the check never asked about
it.** That is the real lesson and it generalises: the check validates the
senders we told it about, so an undeclared sender is invisible to it by
construction. Either a path is declared and checked, or it should not exist.
Once the Gmail alias routes through Papaki there is no fourth path to declare,
which is the better outcome.

### What is **not** affected

- **Booking confirmations.** They leave through Resend with the
  `send.anadyon.gr` envelope and a root-domain DKIM signature, and the measured
  headers recorded earlier in this document show `spf=pass`, `dkim=pass
  header.d=anadyon.gr`, `dmarc=pass`. Unchanged by any of this.
- **The PHP advisory (E33).** Same server, unrelated problem. A mail
  authentication failure is not a symptom of an unpatched runtime.
- **Mail delivery into the mailbox.** This is an outbound authentication
  problem only.

### The risk if it is left

Yahoo blocks today. The same requirement is now enforced by Gmail and Microsoft
for bulk senders and is spreading to ordinary traffic, and `-all` means other
receivers are entitled to reject on SPF alone. **Staff replying to a customer
from Gmail can therefore fail silently from the customer's point of view** —
the sender sees a bounce, the customer sees nothing. DMARC is still `p=none`,
which is the only reason the failure is not worse; tightening it later, which is
otherwise desirable, would make this path fail harder rather than fixing it.

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
