# What needs you, in order — 2 November 2026

**Last verified:** 2 November 2026, Claude.
**Supersedes [`ACTIONS-FOR-TASOS-2026-10-27.md`](ACTIONS-FOR-TASOS-2026-10-27.md)**,
whose first and largest item — the insurance escalation — you closed on
2 November, and which was written for an operating office.

**What changed since that list.** The insurance contracts are fine (your
confirmation; the agent does not re-ask). The office is **closed** and reopens
with preparations at **end of February / early March 2027**. The **website still
takes bookings** and work on it continues.

**The sequencing trap, stated once because it is easy to get wrong in exactly
one direction.** Not everything dates to end-February. Two things are live
*today* because customers are still booking, and the mail deadline is
**January**, about six weeks before anyone returns.

---

## 1. TODAY — one decision, because customers are reading it this week

**The website tells customers theft insurance and CDW are included. They are
not, and the contract they sign charges for both.**

The claim is in four strings, two files, two languages — the Terms *and* the
FAQ. Everything is drafted and nothing is merged.

**What to do:** open
[`PROPOSED-WORDING-THEFT-AND-CDW.md`](PROPOSED-WORDING-THEFT-AND-CDW.md) and
**reply with "A" or "B"**.

- **A** — remove the false claim, say nothing further. Four one-line edits.
- **B** — remove it *and* state plainly that vehicle damage and theft are not
  insured, naming the €5.00/day Full Damage Waiver as Anadyon's own undertaking
  rather than an insurance policy. **Recommended**, because §10 says where cover
  is absent the wording must say so plainly rather than going quiet, and A
  leaves a customer able to believe the waiver is insurance.

**If B needs thought, say A now.** Removing the false claim is the urgent half
and B can follow.

**Time: five minutes.** I merge it the same day; it is a content change covered
by `content.test.ts`, no schema and no migration.

---

## 2. THIS WEEK — cancel the Papaki hosting

**Why now and not in February.** The box runs PHP of an unverified version
against two **CVSS 9.2 unauthenticated remote-code-execution** flaws with public
proof-of-concept exploits, plus two WordPress installs, one rated **10.0** in WP
Toolkit. Closing the office made it **less watched, not less exposed** — nobody
will look at it until spring — and it removed the last argument for keeping it,
because no staff need its webmail now that office mail is on Zoho.

**Steps:**

1. **Log in to the Plesk panel** at `linux207.papaki.gr:8443` and check the
   domain and mail lists. I am confident from outside that only webmail and the
   two WordPress installs remain, but **I cannot see the panel and will not
   assert it** — I got a Plesk screen wrong once by guessing. This is the step
   only you can take.
2. **Check the old Papaki mailbox** once more for anything delivered during the
   DNS change window, and forward anything that matters to Zoho.
3. **Back up both WordPress installs** — WP Toolkit has a backup action. Keep
   the file somewhere other than that server.
4. **Remove both installs.**
5. **Cancel the hosting plan**, keeping the domain registration if it is on the
   same account. Note the renewal date so you are not cancelling into a
   just-paid period.

**This closes E33, E36 and E6**, and removes E37's dependency on an operator who
has left two tickets at **Νέο** since 21 October and 19 September.

**If something does still live there**, tell me and I will re-scope; the interim
is to ask Papaki to disable Roundcube webmail, which removes the PHP surface
without touching mail — Postfix and Dovecot have no PHP in the path.

---

## 3. BEFORE JANUARY — the mailbox decision, and the alias

**Google withdraws Gmail's *Send as* for third-party addresses in January 2027**,
while the office is shut. Office mail already runs on Zoho and is verified, so no
capability is lost — but this must be settled before staff return to it.

### 3a. E39 — one number

**How many people need an office mailbox?** One, two, four?

That number decides it and nothing else does.

- **One or two → Google Workspace.** ≈€85–100/user/year. Very likely cheaper
  outright than maintaining a browser extension against Gmail's DOM.
- **Four or more, or no recurring cost in principle → Zoho for everyone.**
  Already paid for, already verified working. What it costs is the Gmail
  interface, not money.
- **Either way, not the bridge.** Most expensive once maintenance is counted,
  and the only option that puts a component with read access to the
  administrative mailbox on office machines. Seven review rounds did not change
  that; they only removed the engineering unknowns.

**The closure gives the bridge the one thing it never had — time. That is a
reason for care, not encouragement.**

### 3b. E38 — remove the Gmail *Send as* alias

Once 3a's replacement is in place: Gmail → **Settings** → **See all settings** →
**Accounts and Import** → under **Send mail as**, delete
`customerservice@anadyon.gr`.

**Why it is not cosmetic.** While it exists it is the only remaining way to send
a customer from the wrong address — demonstrated on 26 October, when a test
through it bounced from a Google IP while the Zoho path already worked. **After
January it stops bouncing and silently sends as `anadyon.gr@gmail.com`
instead**, which is the §13 failure: a customer receives a reply from a Gmail
address.

**Before deleting**, make sure whoever answers office mail knows the route:
Zoho webmail on a desktop, or the **Gmail app on a phone with the Zoho mailbox
added as a full IMAP account** — which is not *Send as* and keeps working.

---

## 4. CLOUDFLARE — not five minutes any more, and the important half is Google

**Revised 2 November**, after you tried it. This section said "five minutes,
no decision, it should simply be true". Your answer — *we access Cloudflare via
the `anadyon.gr@gmail.com` email* — changes both halves of it.

### 4a. The password it is asking for does not exist

Cloudflare's own documentation says why. An account created through a social
login *"does not have a Cloudflare password"*, and to enable 2FA you must first
*"set a password by going through the password reset process"*. So the prompt is
not a bug and you have not forgotten anything — there is nothing to remember.

**Do it in this order, and the order matters.** Cloudflare states that 2FA
*"can only be enabled successfully on an account with a verified email
address"*, and that *"if you do not verify your email address first, you may
lock yourself out of your account."*

1. **Confirm the email on the account is verified.** My Profile, under your
   name. If it shows unverified, resend and click the link **before** anything
   below.
2. **Log out of Cloudflare.**
3. On the login page choose **Forgot your password?** and enter
   `anadyon.gr@gmail.com`. The reset mail arrives in that Gmail.
4. **Set a password** — a long one from a password manager, not something you
   will need to type.
5. **Now enable 2FA**: My Profile → Authentication → Two-Factor Authentication.
   Use an authenticator app. **Save the recovery codes somewhere that is not
   this Gmail account** — paper, or another password manager. Recovery codes
   stored in the inbox that is also the recovery path protect nothing.
6. Google sign-in keeps working afterwards. You now have both doors.

**One caveat, so a failure does not look like your mistake.** Users have
reported the 2FA screen rejecting a freshly-set password as invalid, on
accounts created exactly this way. If that happens, stop — do not keep
retrying — and tell me; it is a known defect, not something you did, and
Cloudflare support is the route. Do not leave the account half-enrolled.

### 4b. The requirement about the recovery address is already satisfied

This section used to ask you to check the login email is not
`customerservice@anadyon.gr`, because that mailbox is unreachable in the one
scenario the check exists for — DNS lost. It is `anadyon.gr@gmail.com`, which
is Google-hosted and does not depend on `anadyon.gr` DNS at all. **Nothing to
do. That half is closed.**

### 4c. What I had not been looking at, and it matters more

If you get into the dashboard with **Sign in with Google**, then the front door
to the DNS zone and to the only off-site backup is **the Google account**, not
Cloudflare. Cloudflare's documentation does not say whether its own 2FA is even
challenged on a Google sign-in, so I am recording that as **unverified** rather
than guessing — but their own framing is that most Google accounts carry
mandatory multi-factor authentication and that this is *"a seamless and robust
layer of security"*, which points at Google's factor being the operative one.

**So the control that matters most is 2FA on `anadyon.gr@gmail.com` itself**,
and it is not the control this section originally asked for. This is not
theoretical: Cloudflare's own 2012 breach ran through Google account recovery.

Worth saying plainly, because nobody had written it down: that one Gmail
account now holds **the DNS zone, the only off-site backup, and — until the
alias work in §3 is done — the ability to send as
`customerservice@anadyon.gr`**. It is also the account Yahoo was rejecting.
Three unrelated systems behind one login.

**What to check there**, if it is not already true: 2FA on, a passkey or
authenticator rather than SMS, and the Google recovery phone and address up to
date and not pointing at anything `@anadyon.gr`.

Doing 4c is worth more than doing 4a. Do both; do 4c first if you only do one.

---

## 5. WHEN YOU CAN — one log, and it unblocks me

**E35: the unanswered-customer-mail watchdog has been blind since 22 August**,
and it is blind to *this* winter's early bookings for next season.

`public.emails` holds 48 rows, all August. The cron runs every morning, calls
the sync, stores nothing, and reports success.

**Two things, neither readable from an agent session:**

1. **Is the Gmail connection still authorised?**
2. **Send me the Vercel function log for one `morning-briefing` run.**

**Why that one log settles it.** There are exactly three candidates — the OAuth
token expired or was revoked and the client fails silently inside the budget
wrapper; the 25-second budget is exhausted every run; or the connection was
removed. The cron's own `console.info` output names which. With it I fix the
cause. Without it I would be guessing between three and probably fix the wrong
one.

---

## 6. BEFORE THE FIRST RENTAL — not before reopening, which is a different date

### 6a. F1 — the vehicle records

Cover is fine. **The system still holds no insurance expiry for any of the 29
vehicles**, so `rentalBar` — which bars only on `expired` — cannot fire. Harmless
while nothing rents; the entire point is that it is armed *before* anything does.

**What I need, one line per vehicle:** plate, insurer, policy number, expiry.
Plus KTEO expiry and the odometer reading when you have them. Read them to me or
paste them and I will put them into the records.

### 6b. #245 — stripe 23, and a §13 question

Two typecheck failures. The API-version pin is one mechanical line. The second
is not: the deposit payment link currently passes `payment_method_types:
["card"]` — *offer card and only card* — and that field **no longer exists** in
Stripe 23. Remove it and Stripe decides from your dashboard settings, which
could mean a customer paying a deposit is offered methods you never chose.

**Nothing is charging deposits right now, so this is the right time.** Say the
word and I will bring you what Stripe 23 replaces it with, what your dashboard
has enabled, and a before/after of what a customer would actually see.

---

## 7. NO DEADLINE, BUT THEY BLOCK PHASE 2 — the professional questions

`AGENTS.md` reserves these to a person: *answers only a professional can give*.
The briefs are written and forwardable as they are.

- **B4 — counsel and the accountant.**
  [`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md) holds both. **B4's charge-authority
  question is what blocks the rest of phase 2.**
- **B7 — two contract clauses need counsel.** Article 16 grounds data rights in
  **Law 2472/1997**, repealed and superseded by GDPR and Law 4624/2019, and
  bundles marketing consent into the rental, which is not valid consent.
- **B5 — the own-damage policy.** You confirmed on 2 September that it exists;
  it has never been seen here. Which policy carries it, what it covers, **what
  excess it leaves**, and whether that excess changes for a young driver. It
  bears on the CDW half of item 1 — though not on theft, which has no candidate
  policy at all.
- **B2 — the exact Euroins terms** issued with the car policy, from the broker.

---

## What I am doing meanwhile

- Merging item 1 the day you name A or B.
- The Cloudflare zone move, once you confirm the account.
- Closing or re-scoping E33/E36/E6/E37 the moment you say what the Plesk panel
  shows.
- Recording the fleet data as soon as I have it.
- The dependency queue: four merged today including two security updates, and
  only #245 left, which is item 6b.

## What is deliberately not on this list

The decisions with no deadline — the age and licence rules (N2–N5), the two
product menus (N6), the agent-oversight tiers (W33, W34), a second backup
destination (W60), and the §2 benchmark row this morning's work opened (W78).
They are in [`OPEN-ITEMS.md`](OPEN-ITEMS.md) with their reasoning. None degrades
while it waits, and putting them here would make this the list nobody works
through.
