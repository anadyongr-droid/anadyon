# The Papaki dependency, and what it would take to leave

**Last verified:** 26 October 2026, Claude — **the mail decision is made and executing: Zoho, not Google Workspace, and it is no longer optional.** Tasos asked directly whether Papaki is still needed. **After the Zoho cutover they provide exactly two things: the DNS zone and the registration.** Four changes since this paper was written on 24 October: (1) **mail is moving to Zoho now** — DKIM (`zmail._domainkey`) and SPF (`include:zohomail.eu`) are live and verified, MX points at `mx*.zoho.eu`, and a send from Zoho webmail to the Yahoo address that had been rejecting was accepted; (2) **E6 closed by other means** — Papaki finally reissued the certificate on 24 October, so the §4 table below overstates what the move now deletes; (3) **E34's mechanism in §4 is WITHDRAWN** — it says replies leave unauthenticated because "Gmail falls back to Google's servers", and that was disproved when fixing the certificate did not stop the bounce: the alias had been sending through Google all along; (4) **E38 is new and makes this mandatory** — Gmail withdraws *Send as* for third-party addresses in **January 2027**, so the "doing nothing is survivable" counter-argument in §9 has an expiry date. See section 10. Earlier: 24 October 2026, Claude — written on request after three
support tickets went unanswered (E37). This is an options paper, **not a
recommendation to act**: it involves monthly spend and changes how the business
operates, which `AGENTS.md` and `DEFINING-STATEMENTS.md` §13 both reserve to
Tasos.

---

## 1. What Papaki actually provides today

Most of this system already left. What remains with them is narrow:

| Still Papaki's | What it is |
| --- | --- |
| **Registrar** | the `anadyon.gr` registration |
| **DNS zone** | every record — MX, SPF, DKIM, DMARC, the A records |
| **Mailboxes** | `customerservice@anadyon.gr` and the rest: IMAP, SMTP, webmail |
| **The Plesk server** | `linux207.papaki.gr` / `213.158.90.117`, which also still carries a dead WordPress (E36) |
| **Certificates** | the Let's Encrypt certificate securing mail, expired 12 October (E6) |

**Already elsewhere:** the website (Vercel), the database (Supabase),
booking email (Resend), backups (Cloudflare R2), CI (GitHub).

## 2. The insight that makes this cheap: the registrar is not the problem

It is tempting to frame this as "leave Papaki". That is the expensive framing,
because a `.gr` transfer needs a new registrar and their cooperation.

**The pain is DNS, mail and the Plesk server. The registrar is one invoice a
year.** Those can be moved independently, and moving them removes essentially
all of the operational dependency while leaving the registration where it is.

## 3. The target shape

| Layer | Now | Proposed | Cost |
| --- | --- | --- | --- |
| Registrar | Papaki | **unchanged** | as today |
| DNS zone | Papaki | **Cloudflare** | free |
| Mailboxes | Papaki Plesk | **Google Workspace** | ~$7/user/month annual, ~$8.40 monthly ([pricing](https://www.emailvendorselection.com/google-workspace-pricing/)) |
| Plesk hosting | Papaki | **cancelled** | saves whatever it costs |
| Website / DB / email / backups | Vercel / Supabase / Resend / R2 | unchanged | — |

## 4. Why this deletes problems rather than fixing them

This is the argument for doing it. **Five open items stop existing**, rather
than being worked:

| Item | What it is now | After |
| --- | --- | --- |
| **E6** | the expired mail certificate, unrenewable because the domain points at Vercel | **gone** — Google manages its own certificates, for ever, with no renewal that can fail |
| **E34** | replies leave unauthenticated because Gmail falls back to Google's servers | **gone** — Workspace DKIM-signs as `anadyon.gr` natively, and "Send mail as" disappears entirely because the account *is* `customerservice@anadyon.gr` |
| **E33** | PHP unpatched against a CVSS 9.2 unauthenticated RCE | **gone** — no Plesk server |
| **E36** | a WordPress rated 10.0 still installed | **gone** — no Plesk server |
| **E37** | Papaki do not answer tickets | **largely gone** — nothing operational depends on them answering |

**E10** (add a CAA record) also becomes trivial rather than risky, because
Cloudflare's DNS is API-driven and the record can be verified immediately.

## 5. Why Cloudflare for DNS specifically

Not brand preference — one concrete property. **Cloudflare's DNS has an API**,
so a record change stops being a support ticket. Every DNS-shaped problem this
project has had — the SPF investigation, the DKIM question, the `_acme-challenge`
records a wildcard would need, the CAA record — becomes something an agent can
make and verify in the same minute.

It is also free, and faster than most registrar-operated DNS.

**The migration is unusually low-risk here** because the zone is already
documented: `docs/EMAIL-DELIVERABILITY.md` records every record that matters —
the SPF string, the Resend DKIM key on the root, `send.anadyon.gr`'s own SPF,
the DMARC policy, the MX. Copying a zone you have written down is a different
exercise from copying one you have to discover.

## 6. What it costs, and what could go wrong

**Money.** Google Workspace is per mailbox. **The number of mailboxes is not
known to this project** and decides the bill — one is ~$84/year, four is
~$336/year. Zoho Mail is consistently reported cheaper and supports custom
domains, but a current per-user price could not be confirmed; check
`zoho.com/mail/pricing` directly.

**Mail migration.** Existing mail must move, not be abandoned. Google provides
an IMAP migration tool for exactly this. This is the step that needs care and a
quiet afternoon.

**The MX cutover.** There is a propagation window during which mail could
arrive at either side. Standard practice handles it; it is not zero-risk.

**What is *not* at risk:** booking confirmations. They go through Resend and
touch none of this.

## 7. The registrar question, and the ticket that is already open

Ticket **26213, "Αλλαγή καταχωρητή"**, was opened **19 September 2026** and was
still marked **Νέο** on 23 October — **five weeks unanswered**.

If that is a transfer-out request being sat on, it is worth knowing that `.gr`
is regulated by **EETT**, which operates a complaints procedure, and that a
registrar is generally not entitled to obstruct a transfer. **Unverified** —
the specific `.gr` transfer rules and the complaint route have not been checked
against EETT's current published procedure, and should be before anything is
claimed to them.

**But note the sequencing:** if DNS and mail move first, the registrar matters
much less, and a transfer stops being urgent.

## 8. What would be needed from Tasos

Nothing here can be started by an agent: it is spend, a vendor relationship and
a change to how staff work.

1. **How many mailboxes exist on `anadyon.gr`?** This decides the cost and is
   the one fact missing from this paper.
2. **A decision on mail: Google Workspace, Zoho, or stay.**
3. **A decision on DNS: move the zone to Cloudflare, or stay.**

Given the answers, the migration plan itself is ordinary work and can be
written and executed with Tasos present for the cutover.

## 9. The honest counter-argument

**Doing nothing is survivable.** Production — the website, the booking system,
the database, the backups — does not touch Papaki at all. What is broken is the
office mailbox's ability to send authenticated mail, and that has a cheaper fix:
one certificate reissue, which Papaki could do in two minutes if they answered.

**The case for moving is not this outage. It is the next one.** The certificate
needs renewing every ninety days by a company that has not answered three
tickets, and the only reason this one was noticed is that a customer reply
bounced. That is the recurring cost being bought out.

---

## 10. Where this stands on 26 October, and the one sequencing trap

Tasos: *"I want to remove Papaki from the equation. Do we really need them?"*

**Short answer: after the Zoho cutover, for two things — and one of them is
free to move.**

### What is left, measured today

| Layer | Status |
| --- | --- |
| Website, database, booking mail, backups, CI | **never Papaki's** — Vercel, Supabase, Resend, R2, GitHub |
| **Mailboxes** | **leaving now.** Zoho DKIM and SPF live and verified; MX on `mx*.zoho.eu`; outbound to Yahoo accepted |
| **Certificates** | **moot once mail leaves.** The 90-day renewal that depended on Papaki answering disappears with the mailbox |
| **The Plesk server** | **cancellable once mail is off it.** Only `mail.anadyon.gr` and `webmail.anadyon.gr` still resolve to `213.158.90.117`; the apex and `www` are on Vercel |
| **DNS zone** | still Papaki — **movable, free** |
| **Registration** | still Papaki — one invoice a year |

So §2's insight holds and is now sharper: **the operational dependency is almost
gone already.** What remains is a DNS zone that can move in an afternoon and a
registration that barely matters.

### Cancelling the Plesk hosting deletes two open items

Once mail is on Zoho and the fallback MX is removed, nothing needs
`213.158.90.117`. Cancelling that plan **deletes E33** (PHP unpatched against a
CVSS 9.2 unauthenticated RCE, version still unconfirmed because Papaki will not
say) and **E36** (a WordPress installation rated 10.0, still installed, not
needed since the site runs on Vercel).

That is the strongest single argument in this paper: those two are not fixed,
they are *removed*, and they are currently the only security exposure in the
estate that nobody can close by writing code.

### THE SEQUENCING TRAP — move DNS before cancelling anything

**Do not cancel the Papaki hosting plan while the DNS zone is still hosted
there.** The nameservers are `dns1.papaki.gr` / `dns2.papaki.gr`. Whether their
DNS service is billed with the hosting or with the registration **has not been
verified**, and providers do bundle them. Cancelling hosting and discovering it
took the zone with it would take down `anadyon.gr`, `www`, the Zoho MX, the SPF,
both live DKIM keys and the Resend records at once — the whole estate, including
booking mail, which has survived everything else.

**So the order is:**

1. **Finish the Zoho cutover** — in progress; confirm inbound, then demote and
   later remove the Papaki MX.
2. **Move the DNS zone to Cloudflare** (§5 — free, API-driven, and the zone is
   already written down in `EMAIL-DELIVERABILITY.md` and
   `ZOHO-MAIL-CUTOVER-STEPS.md`, which is what makes copying it safe). Change the
   nameservers at the registrar afterwards.
3. **Then cancel the Plesk hosting** — E33 and E36 stop existing.
4. **Leave the registration alone**, or let ticket 26213 run its course without
   urgency. Once DNS and mail are elsewhere, a registrar who does not answer is
   an annoyance rather than a risk.

### The argument for moving DNS, restated after a day of using Papaki's panel

§5 argued for Cloudflare on the grounds that its DNS has an API. Today supplied
the concrete evidence: Papaki's panel appends the zone to whatever is typed, so
Zoho's own fully-qualified rows produced
`bounce-zem.anadyon.gr.anadyon.gr` and
`24165319._domainkey.anadyon.gr.anadyon.gr` — two records live at broken names,
one of which was a DKIM key that would silently never verify. Its apex
convention is a blank field rather than `@`, which no vendor's instructions
assume. And every TTL is **3600s**, with no evident way to lower it for a
cutover.

None of that is catastrophic. All of it is friction that an API and a five-minute
TTL remove, on a zone that now carries three DKIM keys, two SPF records and a
DMARC policy and will be edited again.

### What still needs Tasos

§8's three questions are now one and a half:

1. **Mail — answered.** Zoho, executing.
2. **DNS — open.** Move the zone to Cloudflare? Free, reversible, and the
   prerequisite for step 3.
3. **Hosting — open, and worth money.** Cancel the Plesk plan once DNS is
   elsewhere. This is the one that deletes E33 and E36.
