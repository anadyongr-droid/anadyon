# How Anadyon's email actually leaves the building

**Last verified:** 11 September 2026, Claude — read from live DNS, not assumed.

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

**Resend is not authorised by SPF.** The root record ends `-all` and lists only
`+mx` and the fastmail.gr include — no `amazonses.com`, no Resend. So every
booking confirmation **hard-fails SPF** and passes DMARC on **DKIM alone**.

That works, and it satisfies the Gmail and Yahoo bulk-sender rules, which require
*either* SPF or DKIM to align. But it is a single point of failure with no
fallback: a mistaken DKIM rotation takes every booking email down at once, and
some receivers weigh an SPF hard-fail into reputation even when DKIM passes.
Open item **E4**.

**`send.anadyon.gr` is half-configured and unused.** It carries SPF and the SES
feedback MX but **no DKIM key** (`resend._domainkey.send.anadyon.gr` does not
exist), and nothing sends from it, because the From address is the root domain.
Harmless today; misleading to the next reader.

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

## Before diagnosing the next bounce

1. **Which path?** A bounce naming `grserver.gr` is the office mailbox. A
   delivery problem reported by the app or the Resend webhook is the other path.
2. **`4xx` is temporary and retried; `5xx` is permanent.** The warning above was
   a delay notice, not a failure.
3. **A `421 … ip blocked` is never an SPF or DKIM problem.** It happens before
   either is presented.
4. DNS can be read from here without `dig`, which is not installed:
   `curl -sS -H "accept: application/dns-json" "https://dns.google/resolve?name=anadyon.gr&type=TXT"`
