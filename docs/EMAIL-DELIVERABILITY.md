# How Anadyon's email actually leaves the building

**Last verified:** 26 October 2026, Claude — **THE CERTIFICATE IS VALID AND WAS NOT THE CAUSE. The mail still leaves Google, and the 24 October root-cause claim is WITHDRAWN.** The certificate re-reads clean today — SAN `mail.anadyon.gr, webmail.anadyon.gr`, valid to 22 January 2027, grade A, 89 days left, zero issues. But a bounce dated **25/26 October**, two days *after* it was issued, names sending IP **`209.85.208.51` = `mail-ed1-f51.google.com`** — Google, exactly as before. SPF is `v=spf1 +mx include:_spf.fastmail.gr -all`, authorising only **213.158.90.117** (`linux207.papaki.gr`) and fastmail; `google._domainkey` does not exist. So from Google SPF hard-fails and there is no DKIM key at all, and Yahoo requires DKIM. **My 24 October mechanism — expired certificate → Gmail relay fails → falls back to Google — made a testable prediction and the prediction failed.** The simpler reading, consistent with every bounce held, is that the alias has been sending through Google all along and the certificate expiry was a real but separate fault adjacent in the calendar. The 11 September `relay12.grserver.gr` bounce is withdrawn as evidence of the outbound path. **Two fixes, alternatives not steps:** (A) point the Gmail *Send mail as* alias at `mail.anadyon.gr:587` with TLS — minutes, and only possible now the certificate is valid, which is where that work actually pays off; (B) finish the Zoho migration, already begun per the live `zoho-verification` TXT. **Reading that one Gmail screen settles which route the alias uses**, and nothing outside the account can. Also recorded: a hostname in the *web* certificate's SAN list is **not** proof the SMTP service presents it — Plesk assigns mail separately — and 24 October treated it as proof. Earlier: 21 October 2026, Claude — **PHP exposure section added, on the day PHP shipped emergency fixes for two CVSS 9.2 unauthenticated-RCE flaws (CVE-2026-109618, CVE-2026-109619).** This project has no PHP in the application, the public website or Supabase, and the three `php` strings in the repository are competitors' endpoints we fetch **from**. The exposure is the Papaki/Plesk server `213.158.90.117`, which serves `mail.anadyon.gr` and `webmail.anadyon.gr` and is itself a PHP application with Roundcube webmail — **its PHP version is unverified from here** and the three things needed are Tasos's (E33). Earlier: 19 September 2026, Claude — from live DNS *and* from the full
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

**Add this to the same message — the certificate (E6/E34).** It is the same
server and the same support queue, and it is now the more urgent of the two
for day-to-day operations.

```
Επιπλέον, σχετικά με το πιστοποιητικό SSL του ίδιου server:

Η ανανέωση Let's Encrypt για το anadyon.gr αποτυγχάνει, επειδή το
anadyon.gr και το www δείχνουν πλέον στο Vercel (76.76.21.21) — άρα το
HTTP-01 challenge δεν φτάνει ποτέ στον Plesk.

Αυτό που χρειαζόμαστε είναι πιστοποιητικό ΜΟΝΟ για τους hosts που
παραμένουν στον server σας:

  - mail.anadyon.gr
  - webmail.anadyon.gr

Και τα δύο δείχνουν στο 213.158.90.117, οπότε το HTTP-01 validation
λειτουργεί κανονικά γι' αυτά. ΔΕΝ χρειαζόμαστε wildcard (*.anadyon.gr)
ούτε το anadyon.gr.

Είναι σημαντικό: το ληγμένο πιστοποιητικό φαίνεται να έχει σταματήσει
την αποστολή email μέσω SMTP relay (mail.anadyon.gr:587), με αποτέλεσμα
να αποτυγχάνει η ταυτοποίηση DKIM/SPF των email μας.

Μπορείτε να το εκδώσετε, ή να μας πείτε πώς να το κάνουμε από το Plesk;
```

```
Also, regarding the SSL certificate on the same server:

Let's Encrypt renewal for anadyon.gr is failing because anadyon.gr and www
now point to Vercel (76.76.21.21), so the HTTP-01 challenge never reaches
Plesk.

What we need is a certificate for ONLY the hosts still on your server:

  - mail.anadyon.gr
  - webmail.anadyon.gr

Both resolve to 213.158.90.117, so HTTP-01 validation works for them. We do
NOT need a wildcard (*.anadyon.gr) or anadyon.gr itself.

This matters: the expired certificate appears to have stopped outbound mail
going through the SMTP relay (mail.anadyon.gr:587), which is breaking
DKIM/SPF authentication on our email.

Could you issue it, or tell us how to do it from Plesk?
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

### Both messages came from `customerservice@anadyon.gr` — so the configuration was never working, it was tolerated

*Tasos, 23 October: "Both yahoo emails the successful/silent and the
unsuccessful were sent by customerservice@anadyon.gr."*

**That rules out the alias explanation.** One address means one "Send mail as"
entry, one configured route, and therefore the same route for both messages.
The bounce proves that route is **Google**, unauthenticated. So both messages
were unauthenticated, and Yahoo **accepted one and refused the other**.

**The conclusion follows, and it is not the comfortable one.** Yahoo's
enforcement is not a switch — it is reputation-weighted, applied per message
and per recipient. An unauthenticated sender is tolerated while the volume and
the signals are small, and stops being tolerated as they accumulate. *"It
worked since August and broke today"* is therefore a **slide, not a change**:
nothing on either side was reconfigured, the sender's standing simply ran out.

This retires the two theories that were competing:

- **E6's certificate is not implicated.** The route is Google for both
  messages, so no SMTP relay was in use to be broken by an expired
  certificate. E6 remains open on its own merits — staff mail clients will
  warn — but it is not the cause here.
- **Nor is anything Papaki did in the last 48 hours.** A server-side change
  cannot explain a difference between two messages that never touched that
  server.

### The part that matters commercially, and it is not the bounce

**The message that "did not bounce" is the worrying one.** Yahoo accepted it at
SMTP and may well have filed it as spam; nothing distinguishes that from
delivery at the sending end. Since the configuration has been wrong since
August, the same is true of **every reply sent from Gmail as `anadyon.gr` in
that period**, to every provider — Gmail and Outlook do not bounce an
individual unauthenticated sender, they filter.

For a rental business whose replies are **answers to quote requests**, the
failure mode is a customer who asked for a price and appears never to have
received one. That is lost bookings, invisible from this side, for two months.
It is a stronger reason to fix the setting than the bounce is.

**It also compounds E35.** The watchdog that exists to notice an unanswered
customer thread has itself been blind since August, so the one control that
might have surfaced "this customer never replied to our quote" was not running
either.

### What is still worth confirming, in ten seconds

The reasoning above rests on one inference — that both messages left via
Google — and it is confirmable rather than assumed. Gmail → **Sent** → the
message that went through → **Show original**:

- A `Received:` chain through **Google** with no `DKIM-Signature: d=anadyon.gr`
  confirms it.
- A chain through **`mail.anadyon.gr`** would overturn it, and the certificate
  theory would come back.

**And the history is already in the mailbox.** DMARC aggregate reports go to
`rua=mailto:customerservice@anadyon.gr` and have been arriving daily since the
record was published; each one carries per-IP pass and fail counts. Searching
that mailbox for `Report Domain: anadyon.gr` gives the authentication history
of this domain month by month, from the receivers themselves. Not needed to
justify the fix — the configuration is provably wrong today — but it is the
record that would say how much mail was affected.

### Read from the mailbox, 23 October — and it corrects two things said above

*Tasos asked whether an agent could do these checks itself. The Gmail connector
has no settings tool, so the SMTP change is not an agent's to make — but the
mailbox is readable, so the falsifier and the history were run here instead of
being handed over as homework. Addresses below are redacted; the raw records
are in the mailbox.*

**Correction 1 — the message that "did not bounce" did bounce.** Two messages
went to Yahoo addresses on 23 October, and `mailer-daemon@googlemail.com`
returned *"Message blocked"* for **both**:

| Sent | To | Blocked at |
| --- | --- | --- |
| 19:14:54 | the customer's Yahoo address | 19:15:08, 14 seconds later |
| 20:12:55 | a second Yahoo address | 20:13:07, 12 seconds later |

The second bounce arrived twelve seconds after sending and was evidently not
noticed. **So there is no surviving example of a Yahoo message succeeding
today**, and the puzzle that produced the "reputation slide" theory does not
exist.

**Correction 2 — and this one retires that theory. It genuinely used to
work.** The mailbox holds a long history of replies from
`customerservice@anadyon.gr` to Yahoo recipients — August 2024, July and
August 2025, June, July, August and **2 September 2026** — with **no bounce in
any of those threads**. One is conclusive rather than merely silent: in June
2026 a Yahoo recipient **replied to the reply**, which only happens if it
arrived.

So the statement made earlier in this document — *"the configuration has been
wrong since August and was merely tolerated"* — **is withdrawn. It was wrong.**
Mail from this alias reached Yahoo inboxes for over two years.

**What the evidence now says.** The last Yahoo message that did not bounce was
around **2 September 2026**; the next attempts, on **23 October**, both
bounced. Something changed in that window. The SPF record is not it — it read
`v=spf1 +mx include:_spf.fastmail.gr -all` on 19 September and reads
identically today. **Unverified, and the most likely candidate:** a hard-fail
`-all` combined with no aligned DKIM leaves Yahoo nothing to accept on, and
Yahoo's tolerance for that combination is reputation-weighted rather than
fixed. Whether `-all` itself predates September could not be established from
here.

**Not Yahoo-specific, which matters.** On **26 September** a message sent from
`anadyon.gr@gmail.com` was blocked by **`epsilonnet.gr`** — the accountant's
system — with the same `Message blocked` response. Different recipient,
different sending identity, same class of failure. Whatever is degrading is
not one receiver's opinion.

**The account is a free Gmail, which settles the fix.** Every one of these was
sent from **`anadyon.gr@gmail.com`** using *Send mail as* for
`customerservice@anadyon.gr`. A free Gmail account **cannot** DKIM-sign for
another domain — that needs Workspace — so no amount of DNS will make the
Google path pass. Routing the alias through `mail.anadyon.gr` remains the fix,
and it is now the *only* fix: SPF passes on `+mx` and the published `default`
selector signs.

**Still true from the earlier analysis, and now better supported:** the
commercial risk is mail that is *accepted* and filed as spam rather than
bounced. Yahoo bounced, so those two are known. Gmail and Outlook do not
bounce, so nothing here says how recent replies to those providers fared.

### The relay WAS in use, and stopped — E6's certificate is back as the root cause

*Tasos, 23 October: "But I had already done this many years ago plus there are
more emails sent around 14 Sep to yahoo that didn't bounce back."*

**He is right, and the proof was already in the data gathered above.** On
**11 September 2026** a message sent from `customerservice@anadyon.gr` bounced
— and the bounce came from:

```
MAILER-DAEMON@relay12.grserver.gr
```

**`relay12.grserver.gr` is the Papaki relay.** A rejection issued *by* that
relay means the message was travelling *through* it. So on 11 September the
"Send mail as" alias was relaying through `mail.anadyon.gr` exactly as Tasos
says he configured it years ago. (That particular bounce is the known E5 case —
Naver refusing the grserver relay — which is why it is in the mailbox at all.)

**Today the same alias bounced from `mailer-daemon@googlemail.com`, with Yahoo
naming `209.85.218.42` — a Google address.** Same alias, same mailbox, a
different path out.

**So the route changed between 11 September and 23 October, and that is the
whole answer.** Nothing about the configuration was ever wrong; something
stopped it working and Gmail fell back to sending through Google, where the
domain has neither SPF authorisation nor a DKIM key it could ever use.

**E6 is the obvious cause and is hereby un-retired.** The Plesk certificate for
`anadyon.gr` and `*.anadyon.gr` was failing renewal and due to expire **around
13 October 2026** — inside that window — and was never reissued. Gmail's
"Send mail as" relay requires TLS and validates the certificate; an expired
one breaks the relay, and Gmail reverts to its own servers.

**Two earlier conclusions in this document are therefore wrong and are
withdrawn:**

- *"The configuration has been wrong since August and was merely tolerated"* —
  withdrawn once already, correctly.
- *"E6's certificate is not implicated, because no SMTP relay was in use to be
  broken"* — **withdrawn now.** That inference was drawn from a single bounce
  naming a Google IP, which showed the path *today* and said nothing about the
  path in September. The relay bounce from 11 September was in the same dataset
  and was not read. Looking at one message and generalising to a configuration
  is the same mistake as reading `switch_rows 1` as an identity.

### What this changes, in order

1. **E6 stops being cosmetic.** It was recorded as "staff mail clients will
   warn". It is in fact breaking outbound mail authentication for every reply
   the office sends, to every provider — Yahoo bounces, the rest filter
   silently.
2. **The Gmail setting probably does not need changing** — it needs the
   certificate behind it fixed. Gmail will show the `customerservice@anadyon.gr`
   entry in **Settings → Accounts and Import → Send mail as** either with an
   error or reverted to "Send through Gmail"; that display is the confirmation.
3. **The fix order is therefore: reissue the Plesk certificate (E6), then
   re-point the alias at `mail.anadyon.gr` if Gmail has dropped it, then
   verify.**
4. **The 26 September block by `epsilonnet.gr` is a separate case** and should
   not be folded in: it was sent from `anadyon.gr@gmail.com`, the Gmail
   identity, not the alias.

**Verification once the certificate is back:** send one message from the alias
to any Gmail address, **Show original**, expect `SPF: PASS` and
`DKIM: PASS with domain anadyon.gr`. A bounce arriving from
`…@grserver.gr` rather than from `googlemail.com` is also a positive sign — it
means the relay is carrying the mail again.

### Certificate Transparency, read 23 October — and a better date than 13 October

`crt.sh` answered on the third attempt (it 502s and times out often; it then
refused every follow-up, so **this is common names only — the SAN lists could
not be retrieved**, and whether any of these covers `mail.anadyon.gr` is
therefore **unverified**).

| Issued | Expires | Common name |
| --- | --- | --- |
| 2026-08-18 | **2026-11-16** | `anadyon.gr` |
| 2026-08-18 | **2026-11-16** | `www.anadyon.gr` |
| 2026-07-24 | **2026-10-22** | `rentals.anadyon.gr` |
| 2026-07-14 | **2026-10-12** | `anadyon.gr` |
| 2026-05-25 | 2026-08-23 | `rentals.anadyon.gr` |
| 2026-05-15 | 2026-08-13 | `anadyon.gr` |

**Two things stand out.**

**1. `rentals.anadyon.gr` expired on 22 October and was never renewed.** Its
chain had been renewing every two months without a break — 25 Nov, 25 Jan,
26 Mar, 25 May, 24 Jul — and then stopped. **The bounces began on 23 October,
the day after it lapsed.** That is a far tighter fit than E6's estimated
"around 13 October", and it is the first date in this investigation that lines
up to the day.

**2. A current certificate for `anadyon.gr` and `www` does exist**, issued
18 August and valid to 16 November. That is almost certainly **Vercel's** — it
renews the site's certificate itself — which is consistent with E6's finding
that the *Plesk* renewal is the one failing. The Plesk-side `anadyon.gr`
certificate is the 14 July one, and it **expired on 12 October**.

**What this does not establish:** which certificate the SMTP server on
`mail.anadyon.gr:587` actually presents. Plesk assigns a certificate "for
securing mail" and it need not be the domain's. If it was the `rentals`
certificate, or one renewed on the same schedule, the 22 October expiry
explains the 23 October failure exactly. **That is a hypothesis with a very
good date fit, not a verified fact** — the proxy re-terminates TLS here, so the
presented certificate cannot be read from this environment. One look at Plesk
settles it.

### How to reissue it — and why the obvious route fails

**The reason renewal has been failing is in the DNS, and only for some names:**

| Hostname | Resolves to | HTTP-01 can validate at Plesk? |
| --- | --- | --- |
| `anadyon.gr` | `76.76.21.21` (Vercel) | **No** — the challenge lands on Vercel |
| `www.anadyon.gr` | `76.76.21.21` (Vercel) | **No** |
| `mail.anadyon.gr` | `213.158.90.117` (Plesk) | **Yes** |
| `webmail.anadyon.gr` | `213.158.90.117` (Plesk) | **Yes** |

So a Let's Encrypt request that *includes* `anadyon.gr` can never succeed
again, and one limited to the mail hostnames should succeed immediately. That
is the whole fix.

**The catch:** Plesk's per-domain Let's Encrypt dialog
(**Websites & Domains → anadyon.gr → SSL/TLS Certificates → Install a free
basic certificate**) normally forces the domain itself to be included, with
`mail` and `webmail` as optional extras. Ticking only the extras is often not
possible there, which is why simply re-running it fails the same way it has
been failing.

**Three routes, in the order worth trying.** The exact menu wording varies by
Plesk version and this environment cannot see the panel, so treat the labels
as approximate:

1. **Secure mail at the server level, not the domain level.**
   **Tools & Settings → SSL/TLS Certificates** — this page manages the
   certificates used for the Plesk panel and for the mail server, independently
   of any website. Issue or assign one covering `mail.anadyon.gr` and
   `webmail.anadyon.gr` only. Because both resolve to the Plesk server, HTTP-01
   validation works.
2. **DNS-01 instead of HTTP-01**, if the dialog offers "use DNS validation".
   Plesk prints the `_acme-challenge` TXT records to create. DNS is at Papaki
   rather than Plesk, so the records go in by hand at the registrar — workable,
   but it must be repeated at every renewal unless Plesk is given DNS control.
3. **Ask Papaki to do it.** It is their managed server, the request is small
   and specific, and **a message to them is needed anyway for E33** — so this
   is one support ticket, not two. Paste-ready text below.

**Do not re-request the wildcard.** `*.anadyon.gr` needs DNS-01 every time, it
was failing before, and nothing on that server needs it: the two hostnames
above are the only ones left there.

### Two WordPress installations are still on the Plesk server, one rated 10.0 — 23 October

**Found by Tasos**, who opened Plesk looking for the certificate screen and
landed on **WP Toolkit** instead. The panel is `linux207.papaki.gr:8443`, which
resolves to `213.158.90.117` — the same host as `mail.anadyon.gr`.

Two installations, neither of them needed:

| Installation | WP Toolkit status |
| --- | --- |
| `anadyon.gr/wordpress` | **BROKEN** |
| `anadyon.gr` | **10.0 SECURITY RISK**, plus `SSL/TLS` and `UPDATES` warnings |

**10.0 is WP Toolkit's maximum severity.** This is the item E33 listed third
and framed as a hypothetical — *"the old document root may not have been
emptied, and a leftover PHP site nobody uses is the worst case because nobody
is watching it"* — and it is not hypothetical. **WordPress is PHP**, it is
sitting on the server whose PHP runtime is unpatched against two CVSS 9.2
unauthenticated-RCE flaws (E33), and it is carrying maximum-rated
vulnerabilities of its own with updates outstanding.

**How exposed is it, measured rather than assumed.** Checked 23 October:

- `anadyon.gr` → `76.76.21.21` (Vercel). The live site is **not** this
  WordPress.
- `rentals.anadyon.gr` → **does not resolve at all.**

So neither installation is reachable at a friendly hostname, which is better
than feared. It does **not** make them safe: a Plesk site typically remains
reachable by the server's own hostname or IP, and an unpatched PHP application
on a shared host is a foothold whether or not anybody links to it.

**This also corrects the certificate theory.** `rentals.anadyon.gr`'s
certificate stopped renewing after 24 July and expired 22 October — and the
reason is now obvious and dull: **its DNS record was removed**, so HTTP-01
validation could no longer succeed. The expiry is explained by that, not by
anything to do with mail. **The "22 October, the day before the bounces" date
fit is therefore a coincidence until something else supports it**, and is
withdrawn as evidence. The root-cause case for E6 still rests on the
11 September relay bounce, which is independent of this.

**What should happen, and it is Tasos's call because it destroys data.** The
website runs on Vercel; neither WordPress serves anything. The clean outcome is
to back both up and **remove them**, which deletes a whole class of risk rather
than patching it. An agent can propose that and cannot do it — the panel needs
a login, and `AGENTS.md` reserves irreversible destruction to a person
regardless. Raised as **E36**.

### The Plesk certificate screen, read 23 October — what it shows and what it reissues

Tasos reached **Websites & Domains → anadyon.gr → SSL/TLS Certificates**. The
page confirms the dates from Certificate Transparency exactly and adds the one
thing CT could not give: **which components the certificate is meant to cover.**

```
SSL/TLS Certificate for anadyon.gr
  Let's Encrypt — "Lets Encrypt anadyon.gr"
  Valid To: October 12, 2026        "Will be automatically renewed"
  Certificate attributes are not available.

Secured Components
  Domain                 anadyon.gr            ❗ Not Secured
  Domain with "www"      www.anadyon.gr        ❗ Not Secured
  Webmail access         webmail.anadyon.gr    ❗ Not Secured
  ▸ Show additional components to secure        (collapsed)
Subdomains
  rentals.anadyon.gr                           ❗ Not Secured
```

**Four things follow.**

1. **The expiry is confirmed as 12 October 2026**, matching the CT record for
   the 14 July issuance. "Will be automatically renewed" is the panel stating an
   intention, not a fact — it has not renewed for six weeks, which is E6.
2. **Every component reads "Not Secured"** because the certificate behind them
   has lapsed. Including `webmail.anadyon.gr`.
3. **`mail.anadyon.gr` does not appear in the list.** It may be under the
   collapsed *"Show additional components to secure"*, which is where Plesk puts
   the mail option — **unverified, and it is the single most important thing to
   check on this screen**, because it determines whether this certificate is
   what the SMTP relay on port 587 presents.
4. **A plain "Reissue Certificate" will fail**, and the screen shows why: the
   component list contains `anadyon.gr`, `www.anadyon.gr` and
   `rentals.anadyon.gr`. The first two resolve to Vercel and the third does not
   resolve at all, so HTTP-01 cannot validate any of them. The request fails as a
   whole, which is precisely the loop E6 has been stuck in since mid-September.

**The reissue that should work**, in this panel rather than in the abstract:

1. Expand **"Show additional components to secure"** and tick **Mail**
   (`mail.anadyon.gr`) if it is offered.
2. Press **Reissue Certificate**.
3. In the dialog, **untick** `anadyon.gr`, `www.anadyon.gr` and
   `rentals.anadyon.gr`; **leave ticked** `webmail.anadyon.gr` and Mail.
4. Do **not** tick the wildcard option.

Both remaining names resolve to `213.158.90.117`, so validation succeeds.

**Unticking the domain costs nothing.** The public site is served by Vercel,
which issues and renews its own certificate — CT shows a current one for
`anadyon.gr` and `www` valid to 16 November. Plesk's copy secures a WordPress
no visitor reaches (E36).

**If Plesk refuses to let the domain be unticked** — some versions force the
subscription's primary domain into every per-domain Let's Encrypt request —
then this route is exhausted and the remaining options are the server-level
**Tools & Settings → SSL/TLS Certificates** page, or Papaki. That refusal is
worth recording when it happens, because it is the difference between a
two-minute fix and a support ticket.

### CONFIRMED: the mail component is on this certificate, and the chain is complete

The collapsed section expanded (23 October, Plesk →
Websites & Domains → anadyon.gr → SSL/TLS Certificates):

```
Hide additional components to secure
  Wildcard SSL/TLS certificate   *.anadyon.gr                        ❗ Not Secured
  Mail access   IMAP, POP, SMTP on anadyon.gr                        ❗ Not Secured
  Mail access   IMAP, POP, SMTP on mail.anadyon.gr                   ❗ Not Secured
  DANE support  Add TLSA records for mail services                   ❗ Not Secured
Subdomains
  rentals.anadyon.gr                                                 ❗ Not Secured
```

**`Mail access — IMAP, POP, SMTP on mail.anadyon.gr` is a component of this
certificate, and it is Not Secured.** That component is the SMTP service on
port 587 that Gmail's "Send mail as" relays through. The certificate behind it
expired on **12 October 2026**.

**The chain is now complete and every link is evidenced:**

| Date | Event | Evidence |
| --- | --- | --- |
| 11 Sep | The alias is relaying through Papaki | a bounce issued **by** `relay12.grserver.gr` |
| **12 Oct** | **The certificate expires** | Plesk: `Valid To: October 12, 2026`; CT: issued 14 Jul |
| 12–23 Oct | Gmail's TLS relay fails validation and falls back to Google; replies go out unauthenticated | no Yahoo mail was sent in this window, and Gmail/Outlook recipients accept rather than bounce |
| 23 Oct | First Yahoo recipient since the break | `550 5.7.9`, DKIM and SPF both FAILURE, Google IP |

**The eleven-day gap between the expiry and the first bounce is explained
rather than awkward:** the mailbox shows no mail to a Yahoo address between
2 September and 23 October. Everything sent in that window went to providers
that accept unauthenticated mail and filter it instead of rejecting it — so
nothing bounced, and nothing announced the breakage. **That is the same silent
failure mode as E35, arrived at from a different direction.**

### The reissue — and a correction about what has actually been seen

**Corrected 23 October, immediately after writing it.** The table below was
first written as "tick two, untick everything else", as though the component
list were a set of checkboxes. **It is not.** The screenshots show *status
rows* — each component with `❗ Not Secured` beside it — and the only controls
visible on that page are the three buttons at the top: **Reissue Certificate**,
**Unassign Certificate**, **Advanced Settings**.

Tasos asked where the checkboxes were. The answer is that they were not on the
screen; they were assumed from how Plesk's Let's Encrypt dialog usually works.
**Whether the Reissue dialog offers a component choice at all is unverified**,
and it is the next thing to find out — a reissue that simply repeats the
existing component set will fail exactly as before, because three of those
names cannot be validated.

So the table below is **what the request must end up containing**, not a
description of a UI anyone has looked at:

| Component | Action | Why |
| --- | --- | --- |
| `Mail access … on mail.anadyon.gr` | ✅ **tick** | the whole point; resolves to `213.158.90.117` |
| `Webmail access  webmail.anadyon.gr` | ✅ tick | also resolves there; staff webmail |
| `Domain  anadyon.gr` | ❌ untick | resolves to Vercel — HTTP-01 can never pass |
| `Domain with "www"` | ❌ untick | same |
| `Mail access … on anadyon.gr` | ❌ untick | would add `anadyon.gr` to the request and fail it |
| `Wildcard  *.anadyon.gr` | ❌ untick | needs DNS-01 every renewal; nothing needs it |
| `rentals.anadyon.gr` | ❌ untick | **does not resolve at all** |
| `DANE support` | ❌ **leave off** | TLSA records pin the certificate; publishing them beside a certificate that is being re-issued can stop mail being delivered **at all**. Not a hardening step to take in the same change that is fixing an outage. |

**If the Reissue dialog offers no choice of components**, this route is
finished and the remaining options are the server-level
**Tools & Settings → SSL/TLS Certificates** page, or Papaki. Worth
photographing the dialog either way, because it decides which.

**After it issues**, both remaining names validate over HTTP-01 because both
point at the Plesk server, and the renewal should resume on its own — the
reason it stopped was never a broken renewal mechanism, it was three names in
the request that cannot be validated.

**Verification, in this order:**

1. Plesk shows `Mail access … on mail.anadyon.gr` as **Secured**.
2. Send one message from `customerservice@anadyon.gr` to any Gmail address →
   **Show original** → expect `SPF: PASS` and
   `DKIM: PASS with domain anadyon.gr`.
3. The next failure of any kind should bounce from `…@grserver.gr` rather than
   from `googlemail.com` — that alone proves the relay is carrying mail again.

### Plesk's certificate repository — the diagnosis in the vendor's own words

A third screen, 23 October: the certificate **repository** for the
subscription, with upload controls and the buttons **Add SSL/TLS Certificate**,
**Secure Webmail**, **Secure Mail** and **Remove**.

```
3 items total
  Lets Encrypt anadyon.gr            ✉ Secures both mail and webmail     Used: 3
  Lets Encrypt rentals.anadyon.gr                                        Used: 1
  www_anadyon_gr_9114_4208236                                            Used: 0
```

**`Lets Encrypt anadyon.gr` is labelled by Plesk itself as "Secures both mail
and webmail".** That is the certificate whose `Valid To` is 12 October 2026.
The inference chain built over the previous screens — that the expired
certificate is what the SMTP service presents — is now a statement by the
vendor's own panel rather than a deduction. **E6 and E34 are the same incident
and the diagnosis is closed.**

**Two things on this screen matter for the fix.**

1. **`Secure Mail` and `Secure Webmail` are buttons here.** They assign a
   chosen certificate from this list to the mail and webmail services. So
   pointing mail at a *different, valid* certificate does not require issuing
   anything — it is a selection.
2. **There is a third certificate, `www_anadyon_gr_9114_4208236`, `Used: 0`.**
   The naming is the pattern of a commercial certificate rather than a Let's
   Encrypt one — plausibly issued through Papaki and never assigned. **If it is
   still valid and covers `mail.anadyon.gr`, selecting it and pressing
   `Secure Mail` fixes the outage in one action, tonight, with no issuance and
   no DNS.**

   **Entirely unverified:** its validity dates and the names it covers are not
   on this screen, and nothing read so far says either. Opening it shows both.
   It may equally be long expired, or be a `www.anadyon.gr`-only certificate
   that is useless for mail. It is a lead, not an answer.

**`Remove` is on this screen and should not be touched.** Removing a
certificate that is still assigned — `Used: 3` and `Used: 1` — would unsecure
whatever depends on it.

### RESOLVED 24 October 2026 — the certificate is reissued, and it is the right shape

Papaki reported that they had renewed the mail certificates. That claim was
recorded as unverified on 24 October, because the only instrument that had so
far disagreed with it — Certificate Transparency — showed nothing issued for
`anadyon.gr` since 18 August. **The claim was true and the instrument was
blind.**

Read from SSL Labs' own TLS handshake, which happens on their network rather
than through this container's egress proxy:

```
GET https://api.ssllabs.com/api/v3/analyze?host=webmail.anadyon.gr&all=done

status  : READY            grade: A         issues: 0
subject : CN=webmail.anadyon.gr
names   : mail.anadyon.gr, webmail.anadyon.gr
valid   : 2026-10-24  ->  2027-01-22
issuer  : CN=YR2, O=Let's Encrypt, C=US
ip      : 213.158.90.117
```

**`mail.anadyon.gr` is in the name list.** That is the host the SMTP service
answers on, and the host Gmail's relay connects to — the component Plesk had
been reporting as `Mail access — IMAP, POP, SMTP on mail.anadyon.gr — Not
Secured`. The expired wildcard of 12 October is no longer what mail presents.

**Why this route, and not `openssl`.** Ports 587 and 465 are not reachable from
an agent container, and on 443 the session's egress proxy re-terminates TLS, so
`openssl s_client` returns the proxy's certificate rather than the server's —
the same limitation recorded against E6 on 14 September. SSL Labs performs the
handshake itself and reports the chain it was served, which makes it a genuine
observation of the remote server rather than of the path to it.

**The certificate is scoped exactly as this document recommended**, and that is
worth stating plainly because the recommendation was contested as impractical:
two names, `mail.` and `webmail.`, with no apex, no `www`, no `rentals.` and no
wildcard. Every name on it resolves to `213.158.90.117`, so HTTP-01 can
validate all of them at Plesk, and the renewal that had been failing since
`anadyon.gr` moved to Vercel should now succeed unaided. Whether Papaki reached
that shape through the Reissue dialog, through server-level SSL/TLS, or by
issuing afresh is unknown and no longer interesting.

#### The search that missed it, and why it missed it

This is the part worth keeping. On 23 and 24 October a Certificate Transparency
query on `q=anadyon.gr` returned nothing newer than Vercel's certificate of 18
August, and that absence was written into `docs/OPEN-ITEMS.md` as *"evidence
against, or at least unexplained"*, with the inference that Papaki had assigned
an existing certificate rather than issuing one.

**The narrow shape this document asked for is the shape that query cannot
see.** A CT search on an apex domain surfaces certificates whose common name or
SAN entries match that apex or a wildcard over it. A certificate whose only
names are `mail.anadyon.gr` and `webmail.anadyon.gr` matches neither. The
recommendation and the verification method were in direct conflict, and nobody
noticed because the conflict only appears once the recommendation is followed.

§8 requires an unverifiable claim to be labelled unverified, and it was. The
error was narrower and worth naming on its own: **a measurement's silence was
read as a statement about the world.** "CT shows no new certificate" is a fact
about an index; "no new certificate exists" is a fact about a server, and the
first does not imply the second unless the index is known to be complete for
the thing being asked about. It was not.

For the next certificate question, search CT for `mail.anadyon.gr` and
`webmail.anadyon.gr` as well as the apex, or skip CT and read the handshake.

#### What this proves, and what it does not

**Proven.** TLS on the mail host is valid until 22 January 2027. Gmail's relay
to `mail.anadyon.gr` will no longer fail certificate verification, so it will
no longer fall back to sending as Google — which is the mechanism that stripped
authentication from every office reply between 12 and 23 October.

**Not proven, and deliberately not assumed.** That a reply from
`customerservice@anadyon.gr` to a Yahoo address now passes DMARC end to end.
The certificate was the broken link; a chain with one link repaired is a
repaired link, not a tested chain. Confirming it needs a send, and a send needs
the mailbox:

> Reply to the Yahoo address that bounced on 23 October, or send anything to any
> Yahoo or AOL address from `customerservice@anadyon.gr`.

If it lands, E34 closes. If it bounces, the text discriminates between the two
remaining possibilities: a repeated `550 5.7.9` with DKIM and SPF both failing
means the alias is still leaving via Google and the remedy is the Gmail
"send mail as" setting described above, not anything at Papaki; anything else is
a new finding.

**One item is unblocked by this.** E10 — adding a CAA record — was held behind
E6 on the stated ground that a CAA record set slightly wrong would block
issuance for Vercel and Plesk at once, and that this was not a change to make
while a renewal was already failing. The renewal is no longer failing. E10 can
proceed, and the record must authorise **both** issuers: Let's Encrypt for the
Plesk mail certificate and whatever Vercel's certificates are issued by, read
from the live chain rather than assumed.

### 26 October 2026 — THE CERTIFICATE WAS NOT THE CAUSE. The mail still leaves Google, and my 24 October conclusion is withdrawn

Tasos reports Yahoo still refuses mail from Anadyon. He asked whether the
certificates are valid. **They are** — and that is now beside the point.

**The certificate, re-read today** (SSL Labs handshake against
`webmail.anadyon.gr`, status `READY`, grade **A**):

```
subject : CN=webmail.anadyon.gr
names   : mail.anadyon.gr, webmail.anadyon.gr
valid   : 2026-10-24 -> 2027-01-22   (89 days remaining)
issuer  : CN=YR2, O=Let's Encrypt, C=US
issues  : 0
```

**And the bounce, dated two days AFTER that certificate was issued** — read from
the mailbox, not inferred:

```
Last-Attempt-Date: Sun, 25 Oct 2026 17:14:58 -0700
Remote-MTA: dns; mta5.am0.yahoodns.net.
550 5.7.9 This mail has been blocked because the sender is unauthenticated.
  Yahoo requires this sender to authenticate with DKIM. SPF alone is not
  sufficient. Authentication results:
  DKIM = FAILURE - SPF anadyon.gr with ip 209.85.208.51 = FAILURE
```

**`209.85.208.51` reverse-resolves to `mail-ed1-f51.google.com`.** The 23 October
bounce named `209.85.218.42` → `mail-ej1-f42.google.com`. Both are Google's
outbound mail servers. **The mail is still leaving Google, exactly as it was
before the certificate was fixed.**

#### Why that fails, arithmetically, with the live records

| Record | Value today | Consequence |
|---|---|---|
| SPF | `v=spf1 +mx include:_spf.fastmail.gr -all` | `+mx` authorises **213.158.90.117** only (`linux207.papaki.gr`), plus the fastmail.gr includes. **Google is not in it**, and the record ends `-all`, a hard fail. |
| `google._domainkey` | **does not exist** | Gmail cannot DKIM-sign as `anadyon.gr`. |
| `default._domainkey` | exists | Papaki/Plesk can sign — but only for mail that leaves *their* server. |
| DMARC | `p=none; fo=1` | Reports, does not enforce. Yahoo blocks on its own policy regardless. |

So from Google: SPF hard-fails and there is no DKIM key to sign with. Yahoo
requires DKIM and says SPF alone would not have been enough anyway. The refusal
is correct behaviour, not a reputation problem and not a TLS problem.

#### What I got wrong, and it is the third time on this one incident

On 24 October I wrote that E6 was closed and that *"Gmail's relay to
`mail.anadyon.gr` will no longer fail certificate verification and no longer fall
back to sending as Google — which is the mechanism that stripped authentication
from every office reply between 12 and 23 October."*

**That mechanism is withdrawn.** It made a testable prediction — fix the
certificate and the Yahoo bounce stops — and the prediction failed. There is no
evidence Gmail ever "fell back": the simpler reading, consistent with every
bounce in hand, is that **the alias has been sending through Google all along**,
and the certificate's expiry on 12 October was a real but *separate* fault that
happened to sit next to this one in the calendar.

The error was reasoning from a coincidence of dates to a causal chain. Two
things made it feel solid and neither was evidence: the certificate expired
eleven days before the first Yahoo bounce, and an 11 September bounce had been
*issued by* `relay12.grserver.gr`, which I read as proof the Papaki relay was in
use for outbound mail. A bounce issued by a host does not establish that host as
the outbound path for later mail, and that inference is withdrawn with the rest.

The three readings of this incident, now all superseded, are kept in this
document deliberately: *"always broken, merely tolerated"*; *"a reputation
slide, E6 not implicated"*; and *"E6's certificate is the root cause"*. Each
pointed the fix somewhere different, and the only one that survived contact with
a test is the plainest — **the sending path is wrong**.

#### The certificate work was not wasted, and it is worth being precise about why

It fixed a genuine fault: the wildcard had expired, mail clients were warning,
and `webmail.anadyon.gr` was returning 503. It is also a **precondition** for the
first of the two fixes below, because Gmail verifies TLS when it relays through a
third-party SMTP server and would refuse to use an expired one. So the right
description is: necessary for Option A, insufficient on its own, and never the
cause of the Yahoo refusal.

#### Two fixes, and they are alternatives rather than steps

**Option A — send the alias through Papaki's server.** In Gmail → See all
settings → **Accounts and Import** → *Send mail as* → **edit**
`customerservice@anadyon.gr` → choose **"Send through anadyon.gr SMTP server"**
with host `mail.anadyon.gr`, **port 587**, TLS, and the mailbox's own username and
password. Mail then leaves **213.158.90.117**, which SPF authorises through
`+mx`, and Papaki signs it with `default._domainkey`. Both checks pass and Yahoo
accepts.

*Note the possibility this raises.* If that setting is currently on "Send through
Gmail", it may have been switched — by a person, or by Gmail itself after
repeated TLS failures against the expired certificate, which it does do. Either
way the remedy is the same and it can only be done now that the certificate is
valid. **Reading that one screen also settles the question**: it says in plain
text which route the alias uses, and no amount of DNS or certificate inspection
from outside can.

**Option B — finish the Zoho migration, which has already started.** The live
TXT records now include `zoho-verification=zb99013245.zmverify.zoho.eu`, so the
domain is part-way there. Zoho issues its own DKIM key and SPF include; once MX,
SPF and DKIM point at Zoho and the mailbox sends from Zoho, authentication passes
natively with no dependency on Papaki at all — which is the reason Zoho was
chosen on 24 October. `MAILBOX-PROVIDER-OPTIONS.md` has the order, and the three
records that must survive it: `resend._domainkey.anadyon.gr`, the
`send.anadyon.gr` SPF record, and `_dmarc.anadyon.gr`.

**Which to do.** Option A is minutes and restores Yahoo delivery today, on an
infrastructure the project is leaving. Option B is the decided direction and
removes the dependency permanently, but until MX moves the office mailbox is
still Papaki's. They are compatible: doing A now costs nothing that B undoes,
because B replaces the whole path anyway.

**What still cannot be checked from here, and has not changed.** Whether the
*SMTP service* on ports 25/465/587 presents the new certificate is a separate
Plesk assignment from the web vhost — Plesk has a distinct `Secure Mail` action —
and those ports are unreachable from an agent container, so the only certificate
read today is the one the **web** server offers on 443. On 24 October this
document treated the hostname's presence in that certificate's SAN list as
proof the SMTP service was secured. **It is not proof**, and the distinction is
recorded now rather than left implicit. It does not affect the diagnosis above,
because the failing mail never reaches that server.

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
