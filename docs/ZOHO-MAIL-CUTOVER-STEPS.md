# Moving office mail to Zoho — the steps, in order

**Last verified:** 26 October 2026, Claude — written from Zoho's own
documentation and from this domain's live DNS, read today. The region-specific
values are deliberately **not** guessed; where only your Admin Console can give
the real value, this says so rather than inventing one.

**Owner: Tasos.** Every step is a dashboard or registrar action. Nothing here
can be done from an agent container, and nothing here is reversible by one.

---

## Why Zoho answers both problems at once

There are two separate faults and one change fixes both.

1. **Yahoo refuses your mail today** (E34). Office replies leave **Google**
   (`209.85.208.51` in the 25 October bounce). Your SPF authorises only
   `213.158.90.117` and fastmail, and there is no `google._domainkey`, so SPF
   hard-fails and there is no DKIM signature at all. Yahoo requires DKIM.
2. **Gmail stops carrying the address in January 2027** (E38). *Send as* for
   third-party addresses ends on web **and** mobile.

Fixing only the first — repointing the Gmail alias at `mail.anadyon.gr` — buys
about two months and then hits the second. **Zoho fixes both in one pass**,
because mail then leaves Zoho signed by Zoho, with no Gmail *Send as* anywhere
in the path.

**So the recommendation is to skip the Gmail stopgap and go straight to Zoho.**
There is a specific reason beyond tidiness, in the next section.

### The trap in doing the Gmail stopgap first

Your SPF today reads `v=spf1 +mx include:_spf.fastmail.gr -all`. The `+mx` is
what authorises `213.158.90.117` — **because `mail.anadyon.gr` is currently your
MX.** If you set the Gmail relay up through `mail.anadyon.gr` and then later move
MX to Zoho, `+mx` stops covering that server and **the stopgap breaks the moment
the MX changes**, with the same `550 5.7.9` as now.

It is survivable — you would add `ip4:213.158.90.117` explicitly — but it is two
changes, two tests and a hidden dependency between them. Going straight to Zoho
is one change and one test.

---

## What must survive, checked today

These three are what booking mail runs on, and **none of them is touched by the
steps below**, which is worth knowing before you edit DNS:

| Record | Live value today | Why it is safe |
|---|---|---|
| `send.anadyon.gr` TXT | `v=spf1 include:amazonses.com ~all` | A **subdomain** with its own SPF. The apex SPF edit does not reach it. |
| `send.anadyon.gr` MX | `10 feedback-smtp.eu-west-1.amazonses.com` | Subdomain again. Untouched. |
| `resend._domainkey.anadyon.gr` TXT | the Resend public key | A separate name. Untouched. |

Customer booking confirmations go out through **Resend on `send.anadyon.gr`** and
have worked throughout this incident. The whole point of that subdomain is that
office-mail changes cannot break it. **Do not delete anything under
`send.` or any `*._domainkey` name you did not create today.**

`_dmarc.anadyon.gr` (`v=DMARC1; p=none; rua=mailto:customerservice@anadyon.gr;
fo=1`) also stays as it is. The reporting address keeps working because it is the
same address, just hosted somewhere new.

---

## The steps

**Order matters, and the reason is that it lets you prove the fix before any
inbound mail moves.** Sending from Zoho does not require MX to point at Zoho —
only SPF and DKIM. So steps 1–5 make outbound work and let you test against
Yahoo while mail still arrives exactly as it does now. **MX is last.**

### Step 0 — already done

- Domain ownership is verified: `anadyon.gr` TXT carries
  `zoho-verification=zb99013245.zmverify.zoho.eu`. The `.eu` confirms your
  account is in Zoho's **European data centre**, which is why some values below
  must come from your console rather than from documentation.
- You have created the Zoho mailbox.

### Step 1 — confirm the mailbox is `customerservice@anadyon.gr`

In the Zoho Admin Console, under **Users**, check the address is exactly
`customerservice@anadyon.gr` and not an alias of something else. This is the
address customers reply to and the address in `_dmarc`'s `rua`.

### Step 2 — turn on DKIM and copy the record out

Admin Console → **Domains** → `anadyon.gr` → **Email Configuration** → **DKIM**
→ add a selector and let Zoho generate the key.

Zoho gives you a **selector** (often `zmail`, but take whatever it shows) and a
long public key. Publish at your DNS provider:

```
Name:  <selector>._domainkey.anadyon.gr
Type:  TXT
Value: v=DKIM1; k=rsa; p=<the long key Zoho displays>
```

Then press **Verify** in the console. Do not continue until it verifies — **this
is the record that actually fixes the Yahoo rejection**, because Yahoo's refusal
is specifically *"requires this sender to authenticate with DKIM"*.

### Step 3 — update the apex SPF record

You have **one** SPF record and it must stay one. Zoho's documentation is
explicit: *"There should be only a single SPF record for the domain"*, and
multiple records cause SPF to fail outright.

Change the apex TXT from:

```
v=spf1 +mx include:_spf.fastmail.gr -all
```

to:

```
v=spf1 include:zohomail.com -all
```

Notes, each with a reason:

- **`include:zohomail.com`** is the value in Zoho's SPF documentation. Their
  console may show a different one for the EU data centre — **if it does, use the
  console's**, and tell me so I can correct this file.
- **Drop `+mx`.** Once MX points at Zoho it would authorise Zoho's *inbound*
  servers, which is useless for sending and spends one of the ten DNS lookups SPF
  allows.
- **Drop `include:_spf.fastmail.gr`** *only once nothing sends through Papaki any
  more.* If you are unsure, leave it in for now — it costs a lookup and breaks
  nothing. It is cheaper to remove it later than to discover something still
  needed it.
- **Leave the `zoho-verification=` TXT alone.** It is a separate record at the
  same name; SPF and it coexist.

### Step 4 — send one test, and read the headers

From **Zoho webmail**, signed in as `customerservice@anadyon.gr`, send to the
Yahoo address that bounced. This is the real test of the whole fix.

- **If it arrives** — the Yahoo problem is solved. You may want to open the
  message's original/raw headers and check `Authentication-Results` shows
  `dkim=pass` and `spf=pass`; if it arrived at Yahoo at all, both passed.
- **If it bounces** — send me the bounce. The IP in it tells us where the
  message left from, and that single number distinguishes a DKIM record not yet
  propagated from a wrong SPF value.

**Nothing has moved yet at this point.** Inbound mail still arrives at Papaki, so
if anything is wrong you have changed nothing you cannot change back by editing
two TXT records.

### Step 5 — move MX to Zoho, last

Only after step 4 passes. Admin Console → **Domains** → **Email Configuration**
→ **MX**, and use **the values that screen shows you**.

**I am not giving you MX hostnames.** Zoho's own documentation says *"The TLD for
the MX record will vary based on the DC in which your data is hosted"* and tells
you to read them from Tools & Configurations in the Admin Console. Your account
is in the EU data centre, so the generic `mx.zoho.com` values published in their
help pages are **probably not yours**. Copy the three hostnames and their
priorities from your console exactly.

Delete the old `10 mail.anadyon.gr` MX record in the same edit, so there is never
a moment with both.

**Expect a gap.** DNS caches the old MX for up to its TTL, so for a few hours
some mail will still be delivered to Papaki. Keep the Papaki mailbox alive and
check it for a week afterwards — do not cancel anything at Papaki on cutover day.

### Step 6 — tell the staff where the mail now lives

After cutover, office mail is answered **in Zoho** — webmail in a browser, or the
Zoho Mail app on a phone — or in a desktop client (Outlook, Apple Mail,
Thunderbird) pointed at Zoho's IMAP/SMTP.

**One warning that matters, because it reaches a customer.** The Gmail app will
still let staff *read* a third-party mailbox after January 2027, but **not send
as it**. So a reply attempted from Gmail will either fail or go out as
`anadyon.gr@gmail.com`. Either way the customer sees the wrong address. Tell
whoever answers mail to use Zoho, not Gmail, and remove the *Send as* alias from
Gmail once Zoho is working, so the wrong path is not available to click.

### Step 7 — then, and only then, tidy up

- Remove the Gmail *Send as* entry for `customerservice@anadyon.gr`.
- Remove `include:_spf.fastmail.gr` from SPF if it is still there and nothing
  needs it.
- Consider tightening DMARC from `p=none` to `p=quarantine`. **Not on cutover
  day** — leave it at `p=none` for a few weeks and read the reports first, which
  is what `EMAIL-DELIVERABILITY.md` has always said about tightening.
- E38 and E34 both close when step 4 passes and step 5 completes.

---

## What I could not verify, stated rather than filled in

- **The EU MX hostnames and whether the EU SPF include differs.** Zoho's docs say
  these vary by data centre and point at the console. Only you can read it.
- **Zoho's current DKIM selector naming.** The console generates it; take what it
  shows.
- **Whether anything other than the office mailbox still sends through Papaki.**
  If something does, removing `include:_spf.fastmail.gr` would break it. That is
  why step 3 leaves it optional.

Everything else above is read from live DNS or from Zoho's published
documentation today, not from memory.
