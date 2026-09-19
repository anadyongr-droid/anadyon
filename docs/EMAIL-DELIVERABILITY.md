# How Anadyon's email actually leaves the building

**Last verified:** 19 September 2026, Claude — read from live DNS, not assumed.
Two conclusions from the 11 September pass were withdrawn on 19 September; see below.

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

**Still inference, not measurement.** One `Return-Path:` line from a delivered
confirmation settles it, and nobody has looked yet. E4 is suspended, not closed.

**Do not add `include:amazonses.com` to the root record in the meantime.** It
authorises the entire shared Amazon SES pool — every SES customer — to send as
`anadyon.gr`. That is a real widening, and it would be done to fix a failure
that probably is not happening.

**~~`send.anadyon.gr` is half-configured and unused.~~ — WITHDRAWN 19 September
2026, same misreading.** It has no DKIM key because it does not need one: DKIM
signs as the `From:` domain, which is the root, and that is where the key is.
The subdomain carries the envelope and the bounce path. That is Resend's normal
layout, not an unfinished setup.

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
