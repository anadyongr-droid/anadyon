# The Papaki dependency, and what it would take to leave

**Last verified:** 24 October 2026, Claude — written on request after three
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
