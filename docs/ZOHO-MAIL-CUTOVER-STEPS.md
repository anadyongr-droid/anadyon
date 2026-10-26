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

---

## Papaki's DNS panel: the exact field values — 26 October 2026

DNS for `anadyon.gr` is hosted at **Papaki** (`dns1.papaki.gr`,
`dns2.papaki.gr`), so these records go in Papaki's panel, not Zoho's and not a
registrar's.

**Papaki's host field appends the zone automatically.** The input is displayed
as `[ ______ ] .anadyon.gr`, and the panel's own help text says, in Greek:

> *"Για την εισαγωγή εγγραφής στο naked domain δεν χρειάζεται να εισάγετε τον
> χαρακτήρα @, απλά αφήνετε κενό το πεδίο."*
> — to enter a record for the naked domain you do not need the `@` character,
> simply leave the field empty.

So **`@` is wrong here and so is `anadyon.gr`**: for an apex record the field is
left **blank**. Zoho's table says `@` because that is the common convention; it
is not Papaki's.

| Record | Papaki **host** field | Value | Priority |
|---|---|---|---|
| MX | *(blank)* | `mx.zoho.eu` | 10 |
| MX | *(blank)* | `mx2.zoho.eu` | 20 |
| MX | *(blank)* | `mx3.zoho.eu` | 50 |
| TXT — SPF | *(blank)* | `v=spf1 include:zohomail.eu +mx include:_spf.fastmail.gr -all` | — |
| TXT — DKIM | `zmail._domainkey` | `v=DKIM1; k=rsa; p=MIGf…DAQAB` | — |

**The DKIM row is where this bites.** Enter **`zmail._domainkey`** and nothing
more. Pasting `zmail._domainkey.anadyon.gr` produces
`zmail._domainkey.anadyon.gr.anadyon.gr`, which fails DKIM verification silently
and presents as a propagation delay — hours of waiting for a record that will
never verify. Zoho's own table invites the error by writing its *ZeptoMail* DKIM
host in fully-qualified form while writing the mail one relative.

The general rule, for any future record here: **if the panel shows the zone as a
suffix beside the input, type only the part to the left of it.**

### The state the migration was found in, and the order it forced

Read from live DNS on 26 October, part-way through Tasos's edits:

```
MX   0  mx.zoho.eu        <- added, priority 0 rather than 10
MX  10  mail.anadyon.gr   <- still present
zmail._domainkey          -> not published
apex SPF                  -> still v=spf1 +mx include:_spf.fastmail.gr -all
TTL                       -> 3600s on everything
```

**Priority 0 outranks 10, so inbound mail was already being delivered to Zoho**
while outbound from Zoho was still unauthenticated — no DKIM record, and an SPF
record that does not cover Zoho's sending IPs. A reply sent from Zoho in that
window would have been rejected for exactly the reason the Gmail ones were.

Nothing was lost: mail arrived, and `mail.anadyon.gr` at 10 remained a fallback.
But it inverts this file's ordering, which put MX last precisely so outbound
could be proved first. **The recovery order, where the sequence has already been
broken this way:**

1. **Publish DKIM and the merged SPF immediately** — minutes, and they are what
   make replies from Zoho deliverable.
2. Add `mx2.zoho.eu` (20) and `mx3.zoho.eu` (50).
3. **Change `mx.zoho.eu` from 0 to 10 and delete `10 mail.anadyon.gr` in the
   same edit.** Not before: leaving Papaki at 10 alongside Zoho at 10 is a tie,
   and delivery would alternate between the two at random.
4. Then the Yahoo test send.

**And check both mailboxes meanwhile.** With two MX records live and a 3600s
TTL, recent customer mail may be split between Zoho and Papaki for up to an
hour after each change. Nothing is lost, but it is in two places.

**Worth doing before step 3 if Papaki allows it:** lower the MX TTL to five
minutes, make the change, then put it back. A 3600s TTL means an hour of
split delivery after the cutover rather than minutes.

---

## The outbound test, and what it does and does not prove — 26 October 2026

**Sent from Zoho webmail as `customerservice@anadyon.gr` to the Yahoo address
that had been rejecting. No bounce.**

**The reasoning, and the hole Tasos found in it.** Yahoo's `550 5.7.9` is
returned *synchronously*, inside the SMTP transaction, which is why every
previous failure produced a bounce within seconds. So silence looks like
acceptance.

**It only looks like acceptance if the bounce had somewhere to land.** Tasos
asked: *"unless we are not receiving emails"* — and he is right. The message was
sent as `customerservice@anadyon.gr`, so its Return-Path is that address, which
now resolves through the new MX to **Zoho**. If inbound to Zoho is not working,
a bounce could not be delivered and the silence would mean nothing at all.

**That premise was asserted here without being tested, and it is the same error
as the Certificate Transparency one on 24 October** — reading an absence as
evidence without first establishing that the absence could have been a presence.
Caught in minutes this time rather than days, because it was questioned.

**So the claim is narrowed:** what is *proven* is the DNS, below, which does not
depend on inbound at all. Yahoo's acceptance is **probable and unconfirmed**
until inbound delivery is verified.

So, with the DNS verified across two independent resolvers at full TTL:

| | Before | Now |
|---|---|---|
| Sending IP | `209.85.x.x` (Google) | Zoho EU (`185.20.211.225/27` et al.) |
| SPF | `-all`, Google not authorised → **hard fail** | `include:zohomail.eu` → **pass** |
| DKIM | no key existed for the domain | `zmail._domainkey` → **pass** |
| Yahoo | `550 5.7.9`, four times | accepted |

### The false start worth recording

The first attempt at this test **bounced again**, with IP `209.85.208.47` →
`mail-ed1-f47.google.com`. The DNS was already correct at that point; the message
had simply been sent **from Gmail's *Send as* alias rather than from Zoho**, so
it never exercised the new path.

That is worth writing down for two reasons. It is the obvious way to mis-test
this fix — the old path still exists and still looks like the right one. And it
is a live demonstration of **why the Gmail alias must be removed**: anyone
replying out of habit reproduces the bounce today, and after January 2027 the
same habit sends as `anadyon.gr@gmail.com` with no bounce at all to reveal it.

**The diagnostic that settled it in one number** is worth keeping as a method:
read the IP in the bounce. `209.85.x.x` means the message came from Google;
`185.20.211.x`, `31.186.226.x`, `136.143.169.x`, `185.172.199.x` or
`136.143.171.x` mean it came from Zoho. Nothing else needs checking first.

### What this does and does not close

**Proven, and independent of everything else:** the outbound authentication
records. DKIM is published at the correct name with its `v=DKIM1` tag and a
216-character key, and SPF resolves through `zohomail.eu` to Zoho's real EU
sending ranges — both confirmed at two independent resolvers at full TTL, so
fetched fresh from Papaki's nameservers rather than served from cache. Mail sent
*from Zoho* is now authenticated. That conclusion rests on DNS, not on the
absence of a bounce.

**Probable but NOT proven:** that Yahoo accepted the test. See above.

**Untested at the time of writing:** inbound delivery to the Zoho mailbox. A
message was sent from `anadyon.gr@gmail.com` to `customerservice@anadyon.gr` to
settle it; the outcome belongs in this section once known. Three readings: it
arrives in Zoho (inbound works, and the Yahoo inference holds); it arrives in
Papaki webmail (MX not yet effective for that resolver, 3600s TTL); or it
bounces into Gmail (inbound broken, which would also explain the silence).

**Also not proven, and not to be assumed:** that the message reached the
**inbox** rather than the spam folder. Acceptance at SMTP time and inbox
placement are different things, and a domain that has been failing
authentication for weeks may carry some reputation cost for a while. The
confirmation is the recipient looking, spam folder included. Until then this is
*accepted*, not *delivered to the inbox*.

**Still outstanding, and unaffected by the test:**

1. MX priorities are all `0`; they should be 10 / 20 / 50.
2. `anadyon.gr → mail.anadyon.gr` MX (priority 10) still present and should go —
   the **MX** record only, never the A records for `mail.` or `webmail.`.
3. The two doubled-zone ZeptoMail records are live and should be deleted:
   `bounce-zem.anadyon.gr.anadyon.gr` (CNAME) and
   `24165319._domainkey.anadyon.gr.anadyon.gr` (TXT).
4. Remove the Gmail *Send as* alias for `customerservice@anadyon.gr` — see
   above; it is now the main remaining way to send a customer the wrong address.
5. Simplify SPF to `v=spf1 include:zohomail.eu -all` once nothing has sent
   through Papaki for a week or two: 2 DNS terms instead of 8.

---

## CONFIRMED by headers — 26 October 2026, 20:27 CET

A message sent from Zoho webmail as `customerservice@anadyon.gr` was delivered
and its full headers read. **All three checks pass, and the DKIM selector is the
one this file predicted.** This is no longer an inference from a non-event.

```
Authentication-Results: mx.google.com;
  dkim=pass   header.i=@anadyon.gr  header.s=zmail  header.b=BukLGl1Y;
  spf=pass    (domain of customerservice@anadyon.gr designates
               136.143.169.15 as permitted sender)
              smtp.mailfrom=customerservice@anadyon.gr;
  dmarc=pass  (p=NONE sp=NONE dis=NONE) header.from=anadyon.gr

Received: from sender-op-o15.zoho.eu (136.143.169.15)
          version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384
Return-Path: <customerservice@anadyon.gr>
DKIM-Signature: s=zmail; d=anadyon.gr; i=customerservice@anadyon.gr
```

**Every element of the diagnosis is now verified rather than reasoned:**

| Claim made earlier | Evidence in these headers |
|---|---|
| mail would leave Zoho, not Google | `sender-op-o15.zoho.eu`, **136.143.169.15** |
| that IP would be SPF-authorised | `spf=pass`, and `136.143.169.15` sits in `136.143.169.0/24`, one of the ranges published by `spf.zohomail.eu` |
| the signing selector would be `zmail` | `header.s=zmail` — **the inference was right, and is now a reading** |
| DKIM would align with the From domain | `d=anadyon.gr`, `i=customerservice@anadyon.gr`, `header.from=anadyon.gr` |
| DMARC would therefore pass | `dmarc=pass` |

Zoho's own ARC seal records the same three passing on its side
(`arc=pass (i=1 spf=pass dkim=pass dmarc=pass fromdomain=anadyon.gr)`), so the
chain agrees end to end.

**E34 is closed.** The root cause — office mail leaving an unauthenticated path
— is fixed, and the fix is proven by the headers of a delivered message rather
than by the absence of a bounce.

### Two honest qualifications

**This receipt is from Google, not Yahoo.** The message went to a Gmail address.
What Yahoo demanded was specifically DKIM — *"requires this sender to
authenticate with DKIM. SPF alone is not sufficient."* — and DKIM now passes
with the domain aligned, which is precisely the condition it was refusing on. So
the earlier Zoho→Yahoo send that produced no bounce is corroborated rather than
proved. A Yahoo header would settle it outright, and is worth capturing the next
time one is to hand.

**Inbound to the Zoho mailbox — CONFIRMED shortly afterwards.** The test sent
from `anadyon.gr@gmail.com` to `customerservice@anadyon.gr` arrived **in Zoho**.
So mail flow works in both directions, and the Papaki MX is no longer load-
bearing.

**That also retroactively validates the no-bounce reading.** Tasos's objection
— *"unless we are not receiving emails"* — was the right challenge, and the
answer is now in: because inbound works, a bounce from the Yahoo send *would*
have been delivered to this mailbox. Its absence therefore does mean Yahoo
accepted the message. The inference was sound; what it had been missing was a
tested premise, and the order of operations was wrong rather than the logic.

### What this unlocks

With SPF and DKIM both passing reliably and aligned, **tightening DMARC from
`p=none` becomes viable** — the headers show `p=NONE sp=NONE dis=NONE`, meaning
nothing is being enforced. `p=quarantine` would start protecting the domain from
spoofing rather than merely reporting it.

**Not yet, and not on cutover day.** `EMAIL-DELIVERABILITY.md` has always said to
read the aggregate reports first, and that advice is stronger now rather than
weaker: the reports will show whether anything *else* still sends as
`anadyon.gr` and would be caught by a stricter policy. Revisit after a few weeks
of clean reports, once the Papaki MX is gone and the Gmail alias is removed.

---

## Mail flow is complete — 26 October 2026

**Both directions verified:**

| | Evidence |
|---|---|
| **Outbound** | `dkim=pass header.s=zmail`, `spf=pass` from `136.143.169.15`, `dmarc=pass header.from=anadyon.gr`, read from a delivered message's headers |
| **Inbound** | a message sent from `anadyon.gr@gmail.com` to `customerservice@anadyon.gr` arrived in Zoho |

**The Papaki MX can now go.** It was kept as a demoted fallback only while
inbound was unproven. Keeping it longer is now the *riskier* option, not the
safer one: a temporary deferral at Zoho would route customer mail into a Papaki
mailbox nobody is watching, which is how a customer enquiry gets lost quietly.
The three `mx*.zoho.eu` hosts already provide redundancy within Zoho, which is
what a fallback is for.

**Remaining steps, in order:**

1. **MX** — set `mx.zoho.eu` 10, `mx2.zoho.eu` 20, `mx3.zoho.eu` 50, and
   **delete** `anadyon.gr → mail.anadyon.gr`. One edit, so there is never a tie
   at priority 10.
2. **Remove the Gmail *Send as* alias** for `customerservice@anadyon.gr`. This is
   now the only remaining way to send a customer the wrong address — proven
   today, when a test sent that way bounced from a Google IP while the Zoho path
   was already working.
3. **Keep the `mail.` and `webmail.` A records** for now. They cost nothing and
   are how Papaki's webmail is reached to check for stragglers during the TTL
   window and for a few days after.
4. **Later:** simplify SPF to `v=spf1 include:zohomail.eu -all` (2 DNS terms
   instead of 8); consider DMARC `p=quarantine` after reading aggregate reports;
   then the DNS-to-Cloudflare and hosting-cancellation questions in
   `PAPAKI-DEPENDENCY-AND-EXIT-OPTIONS.md` section 10.

**E34 and E38's immediate pressure are both resolved by this.** E38's January
2027 deadline mattered because office mail depended on Gmail's *Send as*; it no
longer does. What remains of E38 is housekeeping — removing the alias — rather
than a deadline.
