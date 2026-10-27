# What needs you, in order — 27 October 2026

**Last verified:** 27 October 2026, Claude.

Fifty-two open items carry your name. That is not a list anybody works through,
so this is the same list sequenced by **what goes wrong if it waits**, with the
steps written out.

**Read only section 1 if you read nothing else.** Everything below it survives
another week; the first item has already arrived.

Each section says how long it takes, what it closes, and what I can do once it
is done. Where I do not know a screen first-hand, it says so rather than
inventing a click path — `DEFINING-STATEMENTS.md` §8, and I have got a Plesk
screen wrong before by guessing.

---

## 1. TODAY — one phone call. Κ.ΕΞΠΡΕΣΣ, **2695025030**

**Why today and not this week.** `ΗΒΙ 467`'s cover **ends today, 27 October**
(ERGO policy 2088288865/0001, 27/07 → 27/10/2026, from the broker's own list of
29 September). It joins vehicles already past their recorded expiry:

| Plate | Cover recorded to | Days past today |
|---|---|---|
| ΙΡΜ 6966 | 8 October | 19 — a certificate arrived 8 Oct, **unread** |
| ΖΒΒ 564, ΖΒΒ 565, ΖΒΒ 566, ΖΒΒ 567 | 11 October | 16 |
| ΗΒΙ 1560, ΗΒΙ 1569, ΗΒΙ 1570, ΗΒΙ 1837 | 11 October | 16 |
| ΙΜΙ 2840 | 16 October | 11 |
| **ΗΒΙ 467** | **27 October** | **expires today** |
| ΗΒΙ 1568 | 4 November | 8 days away |
| ΖΑΖ 9892 | 9 November | 13 days away |

**This is not a claim that ten vehicles are uninsured.** The broker's habit is
to send the certificate on the day or the day before — ΙΟΖ 4176 and ΙΟΕ 2356 on
3 October for the 4th, ΙΡΜ 6966 on the 8th for the 8th. So cover may well have
been renewed by telephone with the paperwork following. **What is certain is
that nobody here can tell**, and `DEFINING-STATEMENTS.md` §10 is explicit about
where that ends: *"a fleet where cover expiry is tracked on paper will
eventually rent an uninsured vehicle"*. No expiry is recorded against any of the
29 vehicles, so the stop-sell cannot fire and the system would rent any of them
today without a word.

### What to ask, in one call

1. **"Are all of these currently insured, and until when?"** — read the plates
   above. One date each is all that is needed.
2. **"Please email the certificates for the ones I do not have."**
3. If anything on that list is **not** covered, say which vehicles stop renting
   today, and tell the office.

### Then, five minutes with your phone

Three certificates are sitting in the mailbox and **cannot be read from an
agent container** — the Gmail connector returns attachment metadata, not the
bytes. One line each is enough:

- `ANADYON1.pdf` and `ANADYON2.pdf` (arrived 3 October) — the new expiry dates
  for **ΙΟΖ 4176** and **ΙΟΕ 2356**;
- `ANADYON3.pdf` (arrived 8 October) — the new expiry for **ΙΡΜ 6966**.

Reply with "plate — insurer — policy number — expiry" and I will put all of it
into the vehicle records, which is what makes the stop-sell real rather than a
habit. That closes the copying half of **F1**.

---

## 2. THIS WEEK — the website promises cover that does not exist

**30 minutes of reading, and it is the only item on this list where a customer
is currently being told something untrue.**

`lib/legal.ts` §6 lists **"Theft insurance"** and **"Collision Damage Waiver
(CDW)"** as included in **all** rentals. The paper contract sells both as paid
options with a non-waivable excess, and no certificate inspected provides
either. Separately, the website promises *"free 24-hour roadside assistance"*
unqualified, and the 50cc has none.

The corrected wording was drafted on **19 September** and rolled back the same
day, because `DEFINING-STATEMENTS.md` §13 reserves customer-facing wording to
you and I had not asked. It is still sitting unmerged.

**What I need is approval of specific wording, not a general go-ahead** — §13 is
explicit that a general instruction to carry on is not approval of a particular
remedy. So:

1. Say the word and I will put the three drafts in front of you as a before/
   after, one page: what the site says now, what it would say, and which
   policy line each sentence rests on.
2. You approve, change or reject each one.
3. I merge only what you approved.

That closes **W11**, **W12**, **W13** and the approval half of **W2**.

---

## 3. THIS WEEK — decide whether the Papaki server still has a job

**This is now a decision rather than a support problem, and the answer may
delete four open items at once.**

**What changed.** Office mail moved to Zoho on 26 October and is verified —
outbound by headers (`dkim=pass header.s=zmail`, `spf=pass`, `dmarc=pass`),
inbound by a test message arriving. The MX records point at Zoho. **So the
Plesk server at `213.158.90.117` no longer carries the mail**, and I can find
nothing else that needs it: `anadyon.gr` and `www` are Vercel, the application
is Vercel plus Supabase.

**What it still carries, and both are liabilities:**

- **PHP of an unverified version**, on a box serving `webmail.anadyon.gr`. The
  21 October PHP release fixed **CVE-2026-109618** and **CVE-2026-109619** —
  CVSS 9.2, **unauthenticated** remote code execution, public proof-of-concept.
  CERT-EU 2026-018 gives the vector as *"any PHP installation serving web
  requests"*, with one unauthenticated request triggering it before any
  application code runs. The Roundcube login page is sufficient; nobody has to
  sign in. (**E33**)
- **Two WordPress installations**, one rated **10.0 SECURITY RISK** in WP
  Toolkit — WP Toolkit's maximum — neither of which serves anything, since the
  site runs on Vercel. (**E36**)

And Papaki do not answer. Ticket `33030` (PHP) has sat at **Νέο** since 21/10;
ticket `26213` has sat at **Νέο** since 19/09, **five weeks**. (**E37**)

### Option A — cancel the hosting (my recommendation)

This deletes the exposure rather than patching it, and removes the dependency on
an unresponsive operator.

1. **Confirm nothing else lives there.** Log in to the Plesk panel at
   `linux207.papaki.gr:8443` and look at the domain and mail lists. I am
   confident from outside that only webmail and the two WordPress installs
   remain, but I cannot see the panel — this is the one step I cannot do and
   cannot verify for you.
2. **Check the Papaki mailbox once more** for anything delivered during the
   DNS change window, and forward anything that matters to Zoho.
3. **Back up the two WordPress installs** before removing them — WP Toolkit has
   a backup action. Keep the file somewhere off that server.
4. **Remove both installs.**
5. **Cancel the hosting plan**, keeping the domain registration if it is on the
   same account. Note the renewal date so you are not cancelling into a
   just-paid period.

That closes **E33**, **E36**, **E6** (the certificate nobody will renew),
unblocks **E10**'s sequencing, and removes **E37**'s dependency on Papaki for
everything except the domain.

### Option B — keep it, and escalate

If something does still live there:

1. **Reply on ticket 33030** and add the certificate question to it. The
   decisive observation from 23 October is that **there is no certificate
   ticket** — it was raised by email and never entered their queue, which is
   why it went nowhere while the August tickets were completed normally.
2. **Telephone**, quoting 33030 and 26213 as two tickets at Νέο, one for five
   weeks. That is evidence rather than a complaint.
3. **Meanwhile, ask them to disable Roundcube webmail.** Mail is Postfix and
   Dovecot with no PHP in the path, so turning webmail off removes the PHP
   surface without interrupting anything — and nothing uses that webmail now
   anyway.

**Either way, tell me which option**, and I will close or re-scope the four
items accordingly.

---

## 4. FIVE MINUTES EACH — three small things that should simply be true

### 4a. Remove the Gmail *Send as* alias (**E38**)

While it exists it is the only remaining way to send a customer from the wrong
address. On 26 October a test sent through it **bounced from a Google IP** while
the Zoho path was already working. After January 2027 it will stop bouncing and
silently send as `anadyon.gr@gmail.com` instead, which is the §13-relevant
failure.

In Gmail on the web: **Settings** (gear) → **See all settings** → **Accounts
and Import** → under **Send mail as**, **delete** the entry for
`customerservice@anadyon.gr`. If the section is named differently in your
language, it is the one listing addresses you can send from.

**Before you delete it**, make sure whoever answers office mail knows the new
route: **Zoho webmail** on a desktop, or the **Gmail app on a phone with the
Zoho mailbox added as a full IMAP account** — which is not *Send as* and keeps
working after January.

### 4b. Cloudflare: 2FA and the login email (**W64**)

The DNS zone is moving to the account that already holds the **R2 backups**. One
account lost or compromised would take out both the DNS — so mail and the
website — and the only off-site backup, which is what you would reach for while
fixing the first problem.

1. **Turn on two-factor authentication** — Cloudflare dashboard → your profile
   → the authentication section.
2. **Check the account's login email is not `customerservice@anadyon.gr`.** In
   the scenario where DNS is lost, that mailbox is unreachable, so a recovery
   path through it does not exist when you need it.

No decision needed. It should just be true.

### 4c. E39 — the one number I keep asking for

**How many people need an office mailbox?** One, two, four?

That number decides it, and nothing else does. One or two → **Google
Workspace** is very likely cheaper outright (≈€85–100/year for one user,
≈€170–200 for two) than maintaining a browser extension against Gmail's DOM.
Four or more, or no recurring cost in principle → **Zoho for everyone**, which
is already paid for, already working and verified, and costs the Gmail
interface rather than money.

**No emergency**: *Send as* works until January, office mail is authenticated
today, the Yahoo block is closed. My recommendation in **E39** is unchanged —
whichever of those two you pick, **not the bridge**, which is the most expensive
once maintenance is counted and the only option that adds a component with read
access to the administrative mailbox.

---

## 5. WHEN YOU HAVE AN HOUR — the blind watchdog (**E35**)

The email intelligence pipeline **has ingested nothing since August**, so the
unanswered-customer-mail watchdog has been blind for two months while the cron
reports success every morning. `public.emails` holds 48 rows, all August;
`watchdog` and `urgent` alerts last fired 21–22 August.

What it costs: an unanswered quote request in that window produced no alert.

Two things are needed and neither is readable from an agent session:

1. **Is the Gmail connection still authorised?** The likeliest cause is an
   expired or revoked OAuth token failing silently inside the budget wrapper.
2. **Send me the Vercel function log for one `morning-briefing` run.** The
   cron's own `console.info` output says which of the three causes it is.

I can fix it once I know which. Right now I would be guessing between three.

---

## 6. WHEN CONVENIENT — three migrations written and waiting

Per `AGENTS.md`, I never apply a Supabase migration. All three are written with
byte-identical paste copies, and `lib/migrationPasteParity.test.ts` enforces the
pair.

| | What | Paste file |
|---|---|---|
| **M6** | 047 — audit reads of customer data by object | `supabase/migrations/paste/047_pgaudit_customer_object_audit_paste.sql` |
| **M8** | 049 — arm that audit at the role level | `supabase/migrations/paste/049_pgaudit_role_level_switch_paste.sql` |
| **M7** | 048 — make production's `quotes` match the baseline | `supabase/migrations/paste/048_quotes_match_the_baseline_paste.sql` |

**047 and 049 go together or not at all** — 049 is a defect fix for 047, not a
refinement: Supabase permits `pgaudit` configuration only at the role level, so
047's database-level attempt could never have worked.

**048 is independent and you deferred it on 4 October**, which was reasonable:
its diagnostic ran against production and returned **zero** for every failure
mode across 19 rows. Nothing degrades while it waits.

Supabase dashboard → **SQL Editor** → paste the file's contents → run. Then tell
me, and I will verify the result and record it.

---

## 7. NO DEADLINE, BUT THEY BLOCK REAL WORK — the professional questions

These are on the list because `AGENTS.md` reserves them to a person: *"answers
only a professional can give"*. Asking is not reviewing — the briefs are
written and forwardable as they are.

- **B4 — counsel and the accountant.** [`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md)
  holds both briefs, already written. Part A is the accountant (three questions,
  two already answered); Part B is counsel (six questions). **B4's charge
  authority question is what blocks the rest of phase 2.**
- **B7 — two clauses in the signed contract need counsel.** Article 16 grounds
  data rights in **Law 2472/1997**, repealed and superseded by GDPR and Law
  4624/2019, and bundles consent to direct marketing into the rental, which is
  not valid consent. Article 15 gives exclusive jurisdiction in a way counsel
  should look at.
- **B5 — the own-damage policy.** Confirmed to exist on 2 September, never seen
  here. Which policy carries it, what it covers, **what excess it leaves**, and
  whether that excess changes for a young driver. The €5.00/day Full Damage
  Waiver's wording depends on the answer.
- **B2 — the exact Euroins terms** issued with the car policy, from the broker.

**One thing to watch for in B5.** The Full Damage Waiver is sold at €5.00/day
against no own-damage cover on any vehicle inspected. That may be a perfectly
good commercial decision — it is not one that can be described to a customer as
insurance. §10 of `DEFINING-STATEMENTS.md` has the reasoning.

---

## 8. Only if the bridge continues — the four Zoho observations (**W65**)

**Do not start this before answering E39.** If the answer is Workspace or Zoho
for everyone, this work is not needed and the code stays on the branch as a
costed option.

If it does continue: Stage 1 is complete and tested (175 tests), and what it
needs is a **Zoho OAuth client** and a **non-production test address**. With
those, four observations settle the remaining design questions, and they are
specific rather than "verify sending":

1. Send to **two** recipients in one message and confirm **both** received it.
   Zoho documents one address per field and every sample passes one; if a
   comma-joined list delivers to the first only, it does so silently.
2. **Send a reply** and see whether the thread holds in the recipient's client.
   Zoho's published API has **no field for `In-Reply-To` or `References`**, so
   this may not be possible at all — which would be the most important single
   finding about the whole design.
3. **Look in Sent** afterwards and say whether the copy is complete.
4. **Note the `messageId`** the send response returns, and whether that same
   value appears in a Sent listing. That is the reconciliation key, and nothing
   else available settles it.

**One trap worth knowing before you start**, because the failure appears months
later and looks like something else: Zoho allows a user **twenty refresh
tokens** and silently deletes the oldest when a twenty-first is issued,
*including one still in use*. Re-authorising repeatedly while setting up can
revoke the deployment's own token with no error at the time.

---

## What I am doing meanwhile, so you are not waiting on me

- The Cloudflare zone move itself, once you confirm the account (**W64**).
- Closing or re-scoping E33/E36/E6/E37 the moment you say A or B in section 3.
- The three wording drafts in section 2, ready for your approval, on request.
- Recording the insurance dates into the vehicle records as soon as I have
  them, which is what makes the stop-sell fire (**F1**).
- Waiting on Codex's review of the bridge — the brief is
  [`REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md`](REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md),
  sent as a comment on PR #241.

## What is deliberately not on this list

Twenty-odd items owned by you that are decisions rather than deadlines — the
age and licence rules (**N2**–**N5**), the two product menus (**N6**), the
agent-oversight tiers (**W33**, **W34**), the second backup destination
(**W60**). They are in [`OPEN-ITEMS.md`](OPEN-ITEMS.md) with their reasoning
and none of them degrades while it waits. Putting them here would have made
this the list nobody works through.
