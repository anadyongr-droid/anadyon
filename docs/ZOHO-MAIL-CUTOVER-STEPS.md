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

After cutover, office mail is answered in one of three places. **The first one
is worth knowing about, because it keeps the Gmail interface staff already
use** — and it is not the "forwarding workaround" people reach for.

| Where | Works after Jan 2027? | Notes |
|---|---|---|
| **Gmail app on a phone, with the mailbox added as a full IMAP account** | **Yes** | Google's own words: *"you can continue to read and send emails from your other account in the Gmail app"* over *"a standard IMAP connection"*. This is **not** *Send as* — Gmail is acting as an ordinary mail client, sending through Zoho's SMTP, so DKIM and SPF are Zoho's and pass. Google recommends this route for sending. |
| **Zoho webmail in a browser**, or the Zoho Mail app | Yes | The straightforward route, and the only one that works on a desktop with the Gmail look-and-feel gone. |
| **Outlook / Apple Mail / Thunderbird** pointed at Zoho IMAP/SMTP | Yes | For anyone who wants one program holding several mailboxes. |

**Gmail on the desktop web cannot do this.** The IMAP-account route exists only
in the mobile apps; on a computer, *Send as* was the only mechanism and it is
the one being withdrawn. So a member of staff working at a desk needs Zoho
webmail or a desktop client. On a phone they can keep using Gmail.

#### The forwarding idea, and why it only does half the job

A tempting arrangement is to forward `customerservice@anadyon.gr` into
`anadyon.gr@gmail.com` and carry on in Gmail. **Forwarding is fine and
unaffected — for receiving.** Google offers it precisely as a way to get new
mail into a Gmail inbox.

**It does nothing for sending**, which is the half that is broken. Replying to a
forwarded message from a plain Gmail account sends as
**`anadyon.gr@gmail.com`**, because the From address is a property of the sending
account and forwarding never changes it. Google's page offers forwarding for
getting mail *in* and recommends the app-with-IMAP route for sending; it does
not offer forwarding as a way to send.

So forwarding plus plain Gmail gives staff the mail and gives the customer the
wrong address. **It is not a workaround for this problem**, and it is worth
writing down because it looks like one.

**The genuinely dangerous version of that arrangement** is the one that happens
by accident: mail arrives in Gmail by forwarding, staff hit reply out of habit,
and every customer gets a `@gmail.com` reply without anyone noticing. That is a
change to what a customer receives, so **remove the Gmail *Send as* alias once
Zoho works** (step 7) rather than leaving a path that half-works.

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

---

## The actual values, from Tasos's console — 26 October 2026

Zoho's setup screen was read today. **The EU data centre is confirmed** (`.eu`
throughout), so the generic `mx.zoho.com` values in Zoho's help pages are indeed
not this account's, as warned above.

**All three MX hostnames were checked and resolve**, so the console's values are
good:

| Hostname | Priority | Resolves to |
|---|---|---|
| `mx.zoho.eu` | 10 | 185.230.214.166, 185.230.212.166 |
| `mx2.zoho.eu` | 20 | 185.230.214.166 |
| `mx3.zoho.eu` | 50 | 185.230.212.166 |

**DKIM for the mailbox** — selector `zmail`:

```
Host:  zmail._domainkey          (see the naming warning below)
Type:  TXT
Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCjTT+JXCnCJEP8vHDjQ3Nc1zYfD9OIN68Zve1G5RbecQi3ZCkbKc8+4yH7m6c0VOC+gd1ZiH8KFLYiOCxfIkDFRABHEUIsbKn5nGVjyxvmyu3MmtIgXzlQhhJatP0bWOmfKvTzoEOLGII7w6blUzKREhLeTTBYdDpKDZI3McR02wIDAQAB
```

### The SPF value, which the console showed blank

Zoho's screen left the SPF row empty, and their documentation gives three
different candidates depending on which product page you land on. **Resolved
rather than guessed**, today:

| Candidate | What it actually contains |
|---|---|
| `zoho.eu` | `v=spf1 include:spf.zoho.eu -all` — the documented EU name |
| `spf.zoho.eu` | the real EU sending IPs, including `185.230.214.0/23` and `185.230.212.0/24`, which cover the MX hosts above |
| `one.zoho.eu` | `spf.zoho.eu` **plus** `eu.zeptomail.net` and `eu.zcsend.net` |
| `zohomail.com` | US infrastructure — **wrong for this account** |

**Use the apex record:**

```
v=spf1 include:zoho.eu -all
```

- **`zoho.eu`, not `spf.zoho.eu`.** Both work; the first is the documented name
  and survives Zoho renaming the inner record. It costs one extra DNS lookup and
  the total is 2 against SPF's limit of 10, so there is room.
- **Not `one.zoho.eu`.** That authorises ZeptoMail and zcsend as well, which this
  domain does not send through. Authorise only what actually sends.
- **Replaces the whole existing record.** The current
  `v=spf1 +mx include:_spf.fastmail.gr -all` goes. `+mx` would otherwise
  authorise Zoho's *inbound* servers once MX moves, which is useless for sending.

### Skip the "transactional emails" section

Zoho also offered records for **ZeptoMail**, their transactional service:

```
CNAME  bounce-zem.anadyon.gr  ->  cluster89.zeptomail.eu
TXT    24165319._domainkey    ->  k=rsa; p=MIGfMA0GCSqGSIb3...
```

**Do not add these.** Anadyon's transactional mail — booking confirmations and
quotes — already goes through **Resend**, on the `send.anadyon.gr` subdomain,
and it is the half of the mail estate that has worked throughout this incident.
Adding ZeptoMail records creates a second transactional path nobody manages and
a DKIM key nothing signs with.

They are harmless if added, but there is no reason to, and an unused signing key
in DNS is one more thing a future reader has to work out the purpose of.

### The naming footgun in Zoho's own table

Notice that Zoho writes the two DKIM hosts inconsistently: `zmail._domainkey`
for mail (relative) and `24165319._domainkey.anadyon.gr` for ZeptoMail (fully
qualified). **Pasting the wrong form into a DNS panel that appends the zone
automatically produces `zmail._domainkey.anadyon.gr.anadyon.gr`**, which
silently fails DKIM verification and looks like a propagation delay.

**How to tell which form your panel wants, without guessing:** look at how the
existing `resend._domainkey` record is stored. If it shows as
`resend._domainkey`, the panel appends the zone and you enter
`zmail._domainkey`. If it shows the full `resend._domainkey.anadyon.gr`, enter
the full form.

### Do not delete these

Zoho's warning *"Delete existing MX records to prevent email delivery failure"*
is correct and refers to `10 mail.anadyon.gr` — **but not yet** (see the order
below). Whatever else happens, leave these alone:

| Record | Why |
|---|---|
| `send.anadyon.gr` TXT — `v=spf1 include:amazonses.com ~all` | Resend's SPF. Booking mail. |
| `send.anadyon.gr` MX — `feedback-smtp.eu-west-1.amazonses.com` | Resend bounce handling. |
| `resend._domainkey.anadyon.gr` TXT | Resend's DKIM key. |
| `_dmarc.anadyon.gr` TXT | Keep at `p=none` for now. |
| `zoho-verification=...` TXT | Until Zoho's setup is finished. |

### Where this deviates from Zoho's instructions, deliberately

Zoho's screen asks for MX, SPF and DKIM together and tells you to delete the old
MX in the same pass. **Do the DKIM and SPF first, test, and move MX last** — the
order in the steps above. The reason is that sending from Zoho does not require
MX to point at Zoho, so this lets you prove the Yahoo fix while inbound mail is
still arriving safely at Papaki. If it fails, you are two TXT edits from where
you started instead of mid-migration.

**One unknown, flagged rather than assumed:** whether Zoho will let the mailbox
send before MX is pointed at them. Domain ownership is already verified, which is
normally the gate, so it should. **If Zoho blocks the test send until MX is
set**, say so — the fallback is to lower the MX TTL first, switch MX, and keep the
Papaki mailbox alive and monitored for a week, which is a slightly riskier order
rather than a broken one.

### The SPF value, settled from the console — and take the merged one

Zoho's console detected the existing record and offered two options. **The
console's include is `zohomail.eu`, not the `zoho.eu` suggested above** — and
that is the better of the two, because `zohomail.eu` is Mail-specific while
`zoho.eu` covers every Zoho product. The console wins, as this file said it
would.

**Use Zoho's merged option, exactly as given:**

```
v=spf1 include:zohomail.eu +mx include:_spf.fastmail.gr -all
```

**Not their first option**, `v=spf1 include:zohomail.eu ~all`, for two reasons
that their generic advice cannot know:

1. **It downgrades `-all` to `~all`.** The live record ends `-all`, a hard fail.
   `~all` is a soft fail, which receivers may accept. Taking it would weaken
   this domain's anti-spoofing posture at the exact moment the domain is being
   spoofed badly enough that Yahoo refuses it. Keep `-all`.
2. **It drops `+mx` and fastmail immediately.** Nothing has established that
   *nothing* still sends through Papaki or fastmail. Dropping them in the same
   edit that adds Zoho would break any such sender silently, and there would be
   two changes to untangle rather than one.

#### The lookup arithmetic, because `-all` makes it matter

SPF allows **10** DNS-querying terms. Exceed it and the result is `permerror`,
which receivers treat as a failure — so an over-long record with `-all` would
break *all* mail from the domain, which is worse than the problem being fixed.
Counted today, term by term:

```
v=spf1 include:zohomail.eu +mx include:_spf.fastmail.gr -all

 1  include:zohomail.eu
 2    └ include:spf.zohomail.eu        → ip4 only, chain ends
 3  +mx
 4  include:_spf.fastmail.gr
 5    ├ include:_spf1.fastmail.gr      → ip4/ip6 only
 6    ├ include:_spf2.fastmail.gr      → ip4/ip6 only
 7    └ include:_spf3.fastmail.gr
 8        └ include:relay.mailchannels.net → ip4 only, chain ends

 total: 8 of 10
```

**It fits, with two to spare.** The margin is thin though: if fastmail adds a
fourth include, or Zoho lengthens its chain, this record silently becomes a
`permerror`. That is a reason to simplify once the migration is done, not a
reason to avoid the merged value now.

#### Simplify after MX has moved and mail is confirmed

Once inbound is on Zoho and nothing has sent through Papaki for a week or two:

```
v=spf1 include:zohomail.eu -all
```

**2 terms instead of 8.** At that point `+mx` would be authorising Zoho's
*inbound* servers, which never send, and `_spf.fastmail.gr` would be
authorising a provider the domain has left. Dropping both restores the headroom
and leaves a record that says exactly what is true: **Zoho sends for this
domain, and nothing else does.**

`send.anadyon.gr` keeps its own separate record throughout — it ends `~all`,
which is Resend's own specification for a transactional subdomain and is not
affected by any of this.
