# Moving the anadyon.gr DNS zone to Cloudflare

**Last verified:** 26 October 2026, Claude — every record below was read from
live DNS today, not copied from a previous document. Requested by Tasos after
the Zoho mail cutover, as step 2 of
[`PAPAKI-DEPENDENCY-AND-EXIT-OPTIONS.md`](PAPAKI-DEPENDENCY-AND-EXIT-OPTIONS.md)
section 10.

**Owner: Tasos.** Creating the account and changing the nameservers at the
registrar are both dashboard actions. An agent cannot do either, and should not
be the one to decide to.

---

## Why, in one paragraph

Not brand preference. **Cloudflare's DNS has an API and a 300-second TTL**, so a
record change stops being a support ticket and a cutover stops costing an hour
of split delivery. Papaki's zone is on 3600s everywhere with no evident way to
lower it, and its panel appends the zone to whatever is typed — which on
26 October produced two live records at doubled names
(`bounce-zem.anadyon.gr.anadyon.gr` and
`24165319._domainkey.anadyon.gr.anadyon.gr`), one of them a DKIM key that would
silently never have verified. This zone now carries three DKIM keys, two SPF
records and a DMARC policy, and it will be edited again.

It is also the **prerequisite for cancelling the Plesk hosting**, which is what
actually deletes E33 and E36. See the warning below.

---

## THE ONE THING THAT COULD GO BADLY

**Cloudflare's automatic scan will not find every record, and a nameserver
change with an incomplete zone breaks mail.**

Cloudflare imports what it can guess: the A records, `www`, the MX. It cannot
enumerate TXT names it has no reason to try — and **this zone's three DKIM
selectors are exactly that**. If the nameservers are switched before
`zmail._domainkey`, `resend._domainkey` and `_dmarc` exist at Cloudflare, then:

- office mail stops authenticating (DKIM fails → Yahoo refuses again, the
  problem that took three days to diagnose);
- **booking confirmations stop authenticating**, because `resend._domainkey` and
  `send.anadyon.gr`'s own SPF are what make Resend mail pass — and that is the
  half of the estate that has worked throughout everything.

**So the rule is: build the zone completely at Cloudflare, verify it against the
table below, and change the nameservers last.** Cloudflare serves the zone only
once the nameservers point at it, so there is no risk in getting it ready.

---

## The complete target zone, read live on 26 October 2026

### A records

| Name | Value | Proxy | Note |
|---|---|---|---|
| `anadyon.gr` | `76.76.21.21` | **DNS only** | Vercel |
| `www` | `76.76.21.21` | **DNS only** | Vercel |
| `mail` | `213.158.90.117` | **DNS only** | Papaki — keep for now, see below |
| `webmail` | `213.158.90.117` | **DNS only** | Papaki webmail access |

**"DNS only" matters and is the second trap.** Cloudflare defaults new A records
to **proxied** (the orange cloud). Proxying `anadyon.gr` and `www` would put
Cloudflare in front of Vercel, which already terminates TLS and serves the site —
the usual result is a redirect loop or a certificate error, and it is not what
anyone asked for. **Click every cloud grey.** Proxying `mail` or `webmail` would
be worse: Cloudflare's proxy only handles HTTP, so mail protocols would simply
stop.

### MX records

| Name | Value | Priority |
|---|---|---|
| `anadyon.gr` | `mx.zoho.eu` | **10** |
| `anadyon.gr` | `mx2.zoho.eu` | **20** |
| `anadyon.gr` | `mx3.zoho.eu` | **50** |
| `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |

**Note the priorities are the corrected ones.** Live DNS today still shows all
three Zoho hosts at `0` and `mail.anadyon.gr` at `10`; the Papaki MX is being
removed and the Zoho three renumbered. **Do not recreate
`anadyon.gr → mail.anadyon.gr` at Cloudflare.** If it is still present when the
zone is built, leave it out — inbound to Zoho is verified in both directions.

### TXT records

| Name | Value |
|---|---|
| `anadyon.gr` | `v=spf1 include:zohomail.eu +mx include:_spf.fastmail.gr -all` |
| `anadyon.gr` | `zoho-verification=zb99013245.zmverify.zoho.eu` |
| `_dmarc` | `v=DMARC1; p=none; rua=mailto:customerservice@anadyon.gr; fo=1` |
| `zmail._domainkey` | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCjTT+JXCnCJEP8vHDjQ3Nc1zYfD9OIN68Zve1G5RbecQi3ZCkbKc8+4yH7m6c0VOC+gd1ZiH8KFLYiOCxfIkDFRABHEUIsbKn5nGVjyxvmyu3MmtIgXzlQhhJatP0bWOmfKvTzoEOLGII7w6blUzKREhLeTTBYdDpKDZI3McR02wIDAQAB` |
| `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDTOKBfWagpOkqNt62qdyqRfqpRgetCGzenGx4VwvCTYJWFQ6Rn7Whi6/Ym7n+xV6N7IUYoZlLxDopgKapkz4fXbPa25DYycbjLlX+c2+PLmZbPQbxc/JzOgT28gjU+1gklzFiniRBWDnUPOAzhZioroq3zYV7dkfHd+WP3WEQUdQIDAQAB` |
| `send` | `v=spf1 include:amazonses.com ~all` |
| `default._domainkey` | `v=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzZGqR2n+7qGRIybqoEfmgNNj1cgOqnQzQ1hzTJZiNuNQg8TOVBIvhLkbZ92XgcR4dfizm3d2wDzR0Wu8ZKYMRMc7Jal68hghj8SVY7XTw1SdqiLBsultxc0WyCdvosyL8lPJIwWJpoYoNc51Bgkqi8wr5NKDrmNBcmroLWCdel0Z8BBi5295ArXqeKZ5JjRTWMAe3qzBnYnGXl78rhLplDLc/IKnPDK0xybtzr0njRXXpiWwGJoV7UkS9jXWGBohzxD+sagO/bCywQ+6z3ifA6zJRkCapeiXxS5+OvnSR03wQzqOd2QKHUdIZXSIpLT8Kw5B5YH7UPciKDm6fdDaQwIDAQAB;` |

**Two of these can be dropped, deliberately:**

- **`_domainkey` → `o=-`** is an ADSP record. That specification was moved to
  Historic in 2013 and every receiver ignores it. **Do not recreate it.**
- **`default._domainkey`** is Papaki's DKIM key. It signs nothing once mail
  leaves their server. **Carry it over for now** anyway, so the migration is a
  pure move rather than a move plus a change, and drop it when the Papaki
  mailbox is decommissioned.

**Nothing else exists.** Checked today: no `rentals` A or CNAME, no `send` A or
CNAME, no CAA. The `bounce-zem` CNAME and the ZeptoMail DKIM were the two
doubled-name records and have been deleted.

### What NOT to copy

`SOA` and `NS` are Cloudflare's own and are created automatically. Do not try to
recreate Papaki's.

---

## The order

1. **Add `anadyon.gr` to the EXISTING Cloudflare account** — do not create a new
   one. **There is already a Cloudflare account**: the off-site backups live in
   **Cloudflare R2**, used by `backup.yml`, `backup-inventory.yml`,
   `restore-drill.yml` and `production-fingerprint.yml` against
   `<account>.r2.cloudflarestorage.com`. Adding a DNS zone is free and
   independent of R2 billing.
2. **Let Cloudflare scan**, then **check its import against every row above.**
   Expect it to find the A records, `www` and the MX, and to miss some or all of
   the TXT records. Add whatever is missing.
3. **Set every proxy toggle to DNS only (grey).** All four A records.
4. **Verify the zone before switching anything.** Cloudflare shows the zone as
   "pending" and is not yet authoritative, so this is free to get right. Count
   the records: **4 A, 4 MX, 7 TXT** (6 if the ADSP record is dropped, which is
   recommended).
5. **Lower the TTLs** to Auto / 300s. This is one of the reasons for moving.
6. **Change the nameservers at Papaki** to the two Cloudflare gives you. This is
   the only irreversible-feeling step, and it is reversible — the old
   nameservers can be put back.
7. **Wait**, then verify. `.gr` nameserver changes typically take a few hours.
8. **Verify mail both ways again** after propagation: send from Zoho to an
   outside address and check `dkim=pass`/`spf=pass`/`dmarc=pass` in the headers,
   and send to `customerservice@anadyon.gr` and confirm it arrives. **Also send
   one booking-path email** — a quote through the website — because Resend's
   records are the ones Cloudflare's scanner is least likely to have found.

## Only then, hosting

Once the zone is served by Cloudflare and mail is verified, the Papaki hosting
plan can be cancelled — which is what removes **E33** (PHP unpatched against a
CVSS 9.2 unauthenticated RCE, version still unconfirmed) and **E36** (a WordPress
rated 10.0). Before cancelling: copy anything still wanted out of the Papaki
mailbox, and only then drop the `mail` and `webmail` A records.

**The registration stays at Papaki.** It is one invoice a year and nothing
operational depends on them once DNS and mail are elsewhere. Ticket 26213 can
run its course without urgency.

## E10 becomes easy

With API-driven DNS and a 300s TTL, adding the CAA record (E10) stops being
risky. It must authorise **both** issuers — Let's Encrypt for anything still on
Papaki, and whatever Vercel uses, read from the live chain rather than assumed.
Do it after the move has settled, not during.

---

## The account already exists — and that is worth a second thought

**Correction, 26 October 2026.** The steps above originally said to *create* a
Cloudflare account. Tasos pointed out there already is one: **the off-site
backups are in Cloudflare R2**, used by `backup.yml`, `backup-inventory.yml`,
`restore-drill.yml` and `production-fingerprint.yml` against
`<account>.r2.cloudflarestorage.com`. So this is adding a zone to an existing
account, not onboarding a vendor — simpler, one fewer credential, and no new
billing relationship.

### But it concentrates two unrelated things in one account

Worth naming rather than discovering later. **R2 holds the only off-site copy of
the production database** — thirty nightly archives, proven restorable on
20 October (E23). If the DNS zone moves to the same account, then a single
account that is lost, locked or compromised takes out **both**:

- **DNS** — the apex, `www`, the Zoho MX, three DKIM keys, two SPF records and
  the DMARC policy. Mail and the website stop.
- **The backups** — the thing you would reach for while fixing the first
  problem.

The whole point of an off-site backup is independence from the thing it is
protecting against. Putting the zone beside it narrows that independence.

**This is not an argument against moving the zone.** The alternative — leaving
DNS at a provider who does not answer tickets, on hour-long TTLs, in a panel
that silently doubles record names — is a worse risk and a daily one, whereas
this is a tail risk. But two things follow:

1. **Strong authentication on that Cloudflare account is now load-bearing for
   two separate systems.** Hardware or app-based two-factor, and a recovery path
   that does not depend on the `anadyon.gr` mailbox — which would itself be down
   if DNS were lost. A personal address for account recovery, not
   `customerservice@anadyon.gr`.
2. **A second backup destination becomes more valuable than it was.** Not urgent
   and not free, but the argument for one is now stronger: at present a single
   vendor account would hold the DNS, the backups and the restore path. **W60**
   (rebuilding a whole Supabase project from the backup) is the related open
   item; this adds a reason to keep a copy somewhere that is not Cloudflare.

Recorded here rather than acted on: a second backup target is spend and a
decision, so it is Tasos's. The 2FA point is not — it is a five-minute check and
should simply be true.
