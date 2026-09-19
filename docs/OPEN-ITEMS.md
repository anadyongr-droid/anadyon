# Open items

**Last verified:** 19 September 2026, Claude.

**Read this first, every day.** [`DEFINING-STATEMENTS.md` §12](../DEFINING-STATEMENTS.md)
makes it obligatory for every agent, before picking up a task.

Everything known to be outstanding lives here until it is done or deliberately
dropped — and dropping one is recorded with a reason, not deleted. Claude
curates it daily as part of §11.2, but **any agent may add an item the moment it
is noticed**. An item remembered at the close of day is an item that may not be.

Every item has an **owner**. `Agent` means any agent may take it. `Tasos` means
it needs a person, and the item says exactly what is needed.

---

## 📋 Fleet records — the system is built and waiting for this data

| # | Item | Owner |
|---|---|---|
| F1 | **Record insurance contracts, KTEO and kilometrage in the system for every active vehicle.** Insurer, policy number, insurance expiry, KTEO expiry and odometer, for all 29 vehicles. | **Tasos** |

**Nothing has to be built first — and that is the point.** Migration 011 already
added `insurance_provider`, `insurance_policy_no`, `insurance_expiry`,
`kteo_expiry` and `odometer_km` to `vehicles`; the admin vehicle modal already
has an input for each; `lib/fleetStatus.ts` already warns 30 days ahead; and
`/api/admin/vehicles/availability` already refuses to rent a vehicle whose KTEO
or insurance has lapsed — measured against the **pick-up date**, so a booking
taken in March for August is judged on August. `fleetStatus.ts` is explicit that
an expired KTEO voids insurance cover and is an absolute bar, not a warning.

**But it is all inert until the dates are entered.** `rentalBar` bars only on
severity `expired`, and a date that has never been recorded is severity
`unknown` — which does not bar. So a vehicle with no insurance date on file
rents today with **no statutory check at all**. Entering the data is what
switches on protection that already exists and is already tested.

Verified against the code 2 September 2026, not assumed.

## 🚧 Blocking — work cannot proceed correctly until these are answered

| # | Item | Owner |
|---|---|---|
| B6 | **Does the rental use class displace Article 18's declaration requirement?** The Intersalonica terms say that if an under-23 driver's age was not **declared and paid for at inception**, the Company **bears no liability to indemnify** — remedied only by an immediate endorsement at 60% of premium (private licence) or 30% (professional). A rental fleet cannot know its renters at inception. Either the rental use class displaces this, or **every under-23 rental needs a Πρόσθετη Πράξη before the keys move**. B1 does not answer it: unnamed-driver cover and Article 18's declaration duty are different things. **Article 19 does the same for a driver whose first licence is under twelve months old**, at 60% regardless of licence type — so two undeclared loadings may be live, and a young new driver appears to engage both. Ask also whether they compound. Computed cost on our own certificates is **€16.49** (50cc) and **€21.59** (125) per three-month policy at 60%, likely ~1.5× that once duties and taxes are added — but ask the broker for the figure rather than pricing against ours. **The most urgent question on this list.** `INSURANCE-COVER-AND-RESTRICTIONS.md` §2c. | Tasos |
| ~~B0~~ | ~~Widen the cloud environment's network access.~~ **Done 2 Sep** — Tasos set the environment to Custom. Both insurer domains now resolve; the Intersalonica booklet was downloaded and read. Kept one day so it is not re-raised. | Tasos asked on 2 Sep for agents to be able to reach sites useful to the build. **No agent can do this** — it is an account-level setting on the cloud environment (`env_013nFW6rrddhGWTxV1ZRsshx`, "Default", currently **Trusted**), enforced by an egress proxy outside the container. Route: [claude.ai/code](https://claude.ai/code) → cloud icon above the message box → hover the environment → settings gear → **Network access**. Choose **Custom**, list one domain per line, and keep **"Also include default list of common package managers"** checked. Recommended over **Full** — see `INSURANCE-COVER-AND-RESTRICTIONS.md` §7 for the suggested list and the reason. Takes effect for **new** sessions. | Tasos |
| B2 | **Obtain the Euroins terms booklet** — the car's. Half done: the network policy was widened on 2 Sep and the **Intersalonica booklet was downloaded and read in full** (§2c), which governs both motorbikes. Euroins is unread because **their own site is down** — `502 Bad Gateway` from their Azure gateway, not our proxy. Retry, or ask the broker. Until then the car's contractual terms are unknown, and §2c shows how much the booklet can add that the certificate does not show. | Agent to retry; Tasos if the site stays down |
| B5 | **Obtain the own-damage policy.** Confirmed to exist on 2 Sep, never seen here. Needed answers: which policy carries it, what it covers, **what excess it leaves**, and whether the excess changes for a young driver. **The €12/day Full Damage Waiver is sold against terms nobody here has read**, so W2 is blocked on this document rather than on drafting. | Tasos |
| B7 | **Two clauses in the signed contract need counsel.** Article 16 grounds data rights in **Law 2472/1997**, repealed and superseded by GDPR and Law 4624/2019, and bundles consent to direct marketing into the rental — not valid consent. Article 15 gives exclusive jurisdiction to the Zakynthos courts, doubtful against EU-domiciled consumers. `CONTRACT-VS-WEBSITE.md` §8 and §9. | Tasos |
| B4 | **Gate 0 — counsel and the accountant.** Two forwardable briefs, already written. **Now carrying one more question:** article 6β of PD 237/1986 is written as an exclusion, but the compulsory scheme also protects the injured third party — does an excluded claim mean the insurer refuses to pay, or pays the victim and then recovers from us (δικαίωμα αναγωγής)? The difference is whether an excluded claim is a loss borne elsewhere or a debt owed by Anadyon. | Tasos |

## 🗄 Migrations written and awaiting application

Per `AGENTS.md`, agents never apply migrations. Each has a byte-identical copy
under `supabase/migrations/paste/`.

| # | Migration | Status | Owner |
|---|---|---|---|
| M1 | **042** — check-in finalisation | Merged (#93), not applied | Tasos |
| M2 | **043** — handover correction and voiding | In open PR #95 | merge, then Tasos |
| M3 | **044** — insurance surcharge rate row | On `claude/insurance-surcharge`, no PR | Tasos |
| M4 | **Grant the four handover gateways.** `finalise_check_out`, `finalise_check_in`, `correct_handover`, `void_handover` are granted to nobody, so the counter routes cannot work against production. The identity question that blocked this closed on 31 August — it is now a one-line follow-up migration that nobody has written. | not written | Agent |

---

## 🔨 Build work

| # | Item | Owner |
|---|---|---|
| W9 | **Never soften the signed-agreement blocker, and say why in the code.** The Intersalonica terms provide that where the vehicle belongs to a rental business, the insurer's recourse runs **only against the driver — provided a valid rental agreement exists**. So the signed agreement is what stands between Anadyon and the insurer's recourse after an excluded claim. Migration 041 already refuses check-out without one; that turns out to be load-bearing for a reason nobody had written down. Add the reason as a comment so a future agent does not relax it into a warning. §2c. | Agent |
| W11 | **Website says theft and CDW are included; nothing provides either.** `legal.ts` §6 lists "Theft insurance" and "Collision Damage Waiver (CDW)" as included in **all** rentals. The paper contract sells both as paid options with a non-waivable excess, and **no certificate carries either**. Highest-exposure content defect found. `CONTRACT-VS-WEBSITE.md` §1. | Agent |
| W12 | **Publish the exclusion list.** The contract's front page states in capitals that no insurance covers tyres, mirrors, glass, key loss or theft, the underside or the interior. The website says none of it — the customer meets it first at signing. The policies agree with the contract, so this is purely publishing what is already true. §4. | Agent |
| W13 | **Qualify roadside assistance.** Website §10 promises "free 24-hour roadside assistance" unqualified; the 50cc has none. §5. | Agent |
| W14 | **Fix the contract's article 4(f) cross-reference**, which points to "Article 10 (Insurance Coverage)" when insurance is article 8 and article 10 is Ownership. §9. | Agent |
| W15 | **Re-score the §2 feature comparison.** Its counter rows — check-out/check-in, condition capture, digital agreement, damage log — predate phase 2 and are now wrong: 040 and 041 are applied in production, 042 and 044 are written and unapplied, 043 and the HTTP routes sit in PR #95. Re-scoring needs a decision first: does ✅ mean *migration written*, *applied*, or *reachable by staff*? Flagged in the blueprint rather than silently edited. | Agent |
| W17 | **Quote notification emails render an empty address as `, , , Greece`.** Seen on a live 18 September notification: the customer left the address fields blank and the template joined them anyway, producing three commas and a country nobody chose — the country defaults to Greece even for a customer with a Korean mobile and a Korean email. Two small fixes: drop empty parts before joining, and stop defaulting the country when nothing was entered. Staff-facing, so not a customer embarrassment, but it is the address staff copy into the rental agreement. | Agent |
| W16 | **Work the Search Console 404 export when it arrives (E8).** The archive pass is done — 46 redirects now cover the 86 old URLs that were 404ing (`lib/legacyRedirects.ts`). What the export adds is the class the archive cannot show: links to URLs that were *never* ours — a typo, a truncation, a guessed path — plus a measure of what the redirects actually recovered. For each: redirect if there is a sensible destination, and add it to `docs/inbound-links.json` either way. [`INBOUND-LINKS.md`](INBOUND-LINKS.md). | Agent |
| W1 | **Photo upload saga** — the last piece of phase 2. Not started. Blueprint §7. | Agent |
| W2 | **Content correctness against the insurance policies.** The site may currently imply cover that does not exist: theft is uncovered, glass is uncovered, and 50cc has no roadside assistance. `DEFINING-STATEMENTS.md` §10 makes this binding. **Partly blocked on B5** — the FDW wording cannot be written until the own-damage policy's terms and excess are known. The theft, glass and 50cc-assistance corrections are not blocked and can proceed now. | Agent |
| W8 | **Our surcharge age and the insurer's age are computed differently.** Article 18 counts age **from 1 January of the year of birth** (`pickupYear − birthYear`); `lib/rentalPolicy.ts` computes true age on the pick-up date. Insurer age is always ≥ true age, so **we never undercharge** — but we do charge some customers whose birthday falls later in the year and whom the insurer already treats as 23. A decision about whose definition to follow, not a defect. | Agent |
| W10 | **Capture licence issue date, and check the twelve-month rule at check-out.** Article 19 makes a first licence under twelve months old an undeclared-loading trigger with the same "no liability" consequence as the under-23 clause. Check whether the licence issue date is captured today; if not, it needs to be, alongside the category check in W7. §2c. | Agent |
| W7 | **Licence category is a condition of cover, not counter etiquette.** Article 6β of PD 237/1986 excludes from compulsory cover any damage caused by a driver lacking the licence required for that category — and the Supreme Court has held the article's three exclusions exhaustive. So a renter on a 125 with only an AM licence voids cover by statute. **The Intersalonica booklet hardens this further**: a licence for other vehicle types does not count, and the exclusion applies *even if the missing licence played no part in the accident and even if the driver knew how to ride*. No causation defence, no competence defence. Check what the check-out flow verifies today, and make licence category against machine an explicit gate. §2b and §2c. | Agent |
| W4 | **`discount_rules` `age_surcharge` is broken.** Charges per rental not per day; parses the band's *lower* bound so a threshold of 22 also charges a 24-year-old; the public quote route never calls it. Found 2 Sep and deliberately not fixed — it was not what was asked. | Agent |
| W5 | **Admin frozen panes** — open UI defect, three theories disproved and recorded. [`HANDOVER-ADMIN-FROZEN-PANES.md`](HANDOVER-ADMIN-FROZEN-PANES.md). | Agent |
| W6 | **Pin the `app/admin/login/page.tsx` lint warning** with a disable comment. The hard navigation is deliberate — it forces the browser to send refreshed cookies to the middleware after MFA — and "fixing" it would break login. | Agent |

---

## ⚖️ Legal and compliance

| # | Item | Owner |
|---|---|---|
| L1 | **The ΕΠΑνΕΚ 2014-2020 co-funding page no longer exists anywhere on the site.** The previous site served `/επανεκ-2014-2020` (archived title "ΕΠΑνΕΚ 2014-2020") until at least 3 October 2022; the current site has no equivalent and the URL 404s. Businesses taking ΕΣΠΑ/ΕΠΑνΕΚ money carry a **publicity obligation** to display the co-funding notice, and whether it still binds depends on the grant's own terms and its duration-of-obligation period — which is in the grant paperwork, not in anything an agent can reach. Deliberately **not** redirected to the home page: quietly disposing of a possible legal duty is worse than leaving the 404 visible. Check the grant terms; if it still binds, say so and an agent rebuilds the page. The archived copy is recoverable from the Wayback Machine. [`INBOUND-LINKS.md`](INBOUND-LINKS.md). | **Tasos** |

---

## 🧭 Decisions not yet taken

| # | Item | Owner |
|---|---|---|
| N1 | **Is FDW a priced self-insurance product, or withdrawn/repriced?** No own-damage cover behind it on any vehicle, across two insurers. Whatever is chosen, its published wording must be exact. Depends on B3. | Tasos |
| N2 | **Motorbike age by licence category** — AM 16, A1 18, A2 20, as Greek law already sets. Largest commercial gain, smallest cost. [`DRIVER-AGE-MARKET.md`](DRIVER-AGE-MARKET.md) §2 and §7. Depends on B2. | Tasos |
| N3 | **Cars at 19 or 20 with a surcharge**, picking up the segment two local operators serve. §3 and §7. Depends on B2. | Tasos |
| N5 | **Motorbike minimum age: 18 or 21?** The **paper contract already says over 18 for motorbikes**; the website says 21 for everything. One of them is wrong. Greek law sets AM 16 / A1 18 / A2 20, so the contract is the one aligned with the law. `CONTRACT-VS-WEBSITE.md` §2. | Tasos |
| N6 | **Reconcile the two product menus and the two cancellation regimes.** The counter form sells CDW, PAI, FTP, airport tax, fuel and damage charges that the website does not; the website sells seats, GPS and the under-23 surcharge that the form does not. And the contract keeps all prepaid rent on early termination while the website offers free cancellation over 24 hours out. §7 and §9. | Tasos |
| N4 | **Adopt a minimum licence-holding period — the contract already has one.** Contract art. 6.1(a) requires a licence **held at least one year**, and Intersalonica Article 19 prices exactly that line. The website states no tenure rule at all. So this is no longer whether to adopt one — it is publishing and enforcing the one we already contract on. `CONTRACT-VS-WEBSITE.md` §3. Original framing:** Intersalonica **Article 19** charges a **60% loading** for a driver whose *first* licence was issued within the previous twelve months, regardless of licence type, floor €14.67 — and if it was not declared, the insurer **bears no liability to indemnify**. Our own insurer prices exactly the twelve-month line the market uses. Decide whether we refuse under-12-month licences, surcharge them, or declare them; then say so in the terms and check it at the counter. `INSURANCE-COVER-AND-RESTRICTIONS.md` §2c. | Tasos |

---

## 🔁 Repository hygiene

| # | Item | Owner |
|---|---|---|
| ~~R1~~ | ~~`lib/stripe.ts` on `main` does not typecheck on a clean checkout.~~ **Wrong, withdrawn 14 Sep.** `main` typechecks fine: CI installs with `npm ci`, which honours the lockfile's **stripe 22.5.0**, and the pinned `2026-07-29.dahlia` is correct for it. The error only appeared in an **agent sandbox that had run `npm install`**, resolving the caret in `package.json` to 22.6.0 and reporting the mismatch *inverted*. The pin was then "fixed" to match the sandbox on three branches, which is what actually broke CI on #107. **The remedy for a local mismatch is `npm ci`, never editing the literal.** Recorded in `lib/stripe.ts` as a comment so the next agent does not repeat it. **Still to clean up:** `claude/insurance-surcharge` carries the same bad edit and will fail CI until reverted. |
| R2 | **Dependabot backlog**, in this order: #96 (production group), #83 (CodeQL), #78–#81 (Actions majors, one at a time), #85, #86, and **#87 TypeScript 7 last** — it is the one likely to break. | Agent |
| R3 | **Four stale PRs** — #16 (NBG payments, draft), #31 (incident closure), #58 (agent loop, draft), #71 (Epsilon/AADE, draft). Oldest from 22 August. Finish or close. | Agent |
| R4 | **`codex/incident-admin-middleware-timeout`** has never been merged and has no PR. | Agent |
| R5 | **Open PRs awaiting merge:** #95 (phase 2 correction/voiding + HTTP routes), #98 (sandbox disk). **#99 merged 2 Sep** — insurance findings, `DEFINING-STATEMENTS` §10–§12, this list, and the worklog. | Agent |
| R6 | **`claude/insurance-surcharge` has no PR.** Pushed and green; not opened because it was not asked for. | Agent |

---

## 🏗 Environment and tooling

| # | Item | Owner |
|---|---|---|
| E6 | **Reissue the Plesk certificate for only the hosts still on that server.** Papaki reports Let's Encrypt renewal failing for `anadyon.gr` and `*.anadyon.gr`, **29 days to expiry**. Cause, inferred from DNS: `anadyon.gr` and `www` now resolve to **76.76.21.21 (Vercel)**, so the HTTP-01 challenge no longer reaches Plesk and can never succeed. Vercel issues and renews the website's certificate itself — nothing needed there. But the wildcard is what secures **`mail.anadyon.gr`** (213.158.90.117, Papaki), so staff mail clients start warning if it lapses. **Fix in Plesk:** reissue for `mail.anadyon.gr` and the webmail/panel host only, dropping `anadyon.gr` and the wildcard. Booking confirmations unaffected — they go via Resend. Which hostnames that certificate is actually bound to could not be verified from here; the session's egress proxy re-terminates TLS, so `openssl` returns the proxy's certificate, not the real one. `EMAIL-DELIVERABILITY.md`. | **Tasos** |
| E9 | **DMARC: do NOT tighten `p=none` yet — a real failing source was found.** Three reports read 19 September (`docs/dmarc/`, `npm run check:dmarc`). Four of five sources are grserver's relay pool (relay11/14/15, IPv4 and IPv6) and all pass SPF and DKIM aligned. The fifth, `mail-sor-f41.google.com`, is a **Gmail forwarder that failed DMARC outright** — SPF passed for `gmail.com` (unaligned), no DKIM survived the forward. Under `p=quarantine` that message goes to spam, and `customerservice@anadyon.gr` forwards to Gmail, so this hop is live. **Next:** collect a week or two across all five receivers; establish whether that forwarded mail reaches customers or only the internal Gmail copy; if tightening, ramp with `pct=10` first. Reports were being deleted unread and Gmail purges its bin after 30 days — the durable fix is pointing `rua=` at a parsing service (Postmark's is free; `rua` takes a comma-separated list so the mailbox copy can stay). [`EMAIL-DELIVERABILITY.md`](EMAIL-DELIVERABILITY.md). | Agent + **Tasos** (save reports before they purge) |
| E10 | **Add a CAA record — after E6, not before.** The domain has none, so any CA may issue for it. Normally a cheap hardening step, but the Plesk Let's Encrypt renewal is *already* failing (E6), and a CAA record set slightly wrong blocks issuance for Vercel and Plesk at once. Sequence matters: fix E6, confirm both certificates renew, then add CAA. | Agent (with Tasos at the registrar) |
| E5 | **Naver has blocked the office mail relay — and it is costing bookings now, not hypothetically.** `relay12.grserver.gr` (`88.99.38.195`, shared Hetzner range) is refused by `mx4.mail.naver.com` with `421 4.3.2 Your ip blocked`, ref `VPdBxVRJReWvU4oJvox9JA`. Refused at connection time, before authentication, so SPF, DKIM and content play no part. **Nothing is misconfigured on our side** and only grserver can request delisting. **A quote request from a `naver.com` customer with a Korean mobile arrived on 18 September for a next-day pick-up** — any staff reply from the mailbox would have bounced, unseen by the customer. Ask grserver for delisting, and until it clears see the Korean-customer workaround in [`EMAIL-DELIVERABILITY.md`](EMAIL-DELIVERABILITY.md). | **Tasos** |
| E8 | **Confirm whether `anadyon.gr` is verified in Google Search Console, then export *Indexing → Pages → Not found (404)* and the Links report.** Step-by-step in [`INBOUND-LINKS.md`](INBOUND-LINKS.md). Checked 19 September: no `google-site-verification` meta tag and no DNS TXT beyond SPF, which rules out two methods but not the Analytics one, so it may already be connected. **If it is not:** use a *URL-prefix* property (`https://anadyon.gr`) and the Google Analytics method — GA is already live under the same Google account. The Analytics method does **not** work for a *Domain* property; Google's docs say DNS is "the only way to verify a Domain property", and adding a DNS record is the registrar trip that E4 already needs. Note the limits before setting expectations: the 404 report covers **only the past month**, and the Links report is a **sample capped at 1,000 rows** — this is a discovery feed for what is still breaking, not a historical audit. Drop the CSVs in `docs/` and an agent takes it from there. Free and worth the same trip: Bing Webmaster Tools and Ahrefs Free. | **Tasos** |
| E1 | **Sentry project** — needs a dashboard. [`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md). | Tasos |
| E2 | **Staging reset from main** via the guarded `npm run staging:reset`. | Tasos |
| E3 | **Remaining §8 browser checks** not yet run. Recorded as not run, never as passed. | Agent |

---

## ✅ Recently closed

Kept briefly so a closed item is not reopened by someone who remembers it as open.

| Item | Closed | How |
|---|---|---|
| RPC staff identity — how does a function know who is calling? | 31 Aug 2026 | Option A adopted, diagnostic run and removed (#94). Production grant gate cleared. |
| Driver-age contradiction between terms, modal and FAQ (audit B1) | before 2 Sep | `lib/rentalPolicy.ts` single-sources all three. The audit file still reads as open. |
| Document upload verified against staging | 31 Aug 2026 | Verified. |
| Young-driver surcharge published but never charged | 2 Sep 2026 | Built at €5/day under 23, `claude/insurance-surcharge`. Migration 044 still to apply — see M3. |
| **Insurance renewals — car, 125 and 50cc** | 2 Sep 2026 | Tasos is handling the renewals directly. The 125 (ΖΒΒ 0565) certificate was the stale copy it looked like: the current policy is **217443636**, 11 Jun → **11 Sep 2026**. Both motorbikes now expire on the same day. Superseded by F1, which is what puts the dates where the system can act on them. |
| **B1 — are renters covered as unnamed drivers?** | 2 Sep 2026 | **Yes**, confirmed by Tasos. The single largest risk in the insurance reading, closed. |
| **B3 — is there own-damage cover we have not been shown?** | 2 Sep 2026 | **Yes**, confirmed by Tasos. The earlier conclusion that FDW was entirely self-insured is **withdrawn**. Replaced by B5: the cover exists, its terms and excess have not been seen, and the waiver's wording depends on them. |
| **Insurance expiry in the vehicle record, with stop-sell** | already built | Found on 2 Sep to exist already — migration 011 columns, the admin modal inputs, `lib/fleetStatus.ts` 30-day warnings, and a hard bar in the availability route measured against the pick-up date. Was listed as open build work in error. What remains is the data, not the code: F1. |
