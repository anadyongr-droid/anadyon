# Anadyon major pre-launch audit

**Audit date:** 18 August 2026 (Europe/Luxembourg)  
**Release assessed:** Git commit `6e57a10b0dd2e8e3d013b747f737eb87ae036b77`, deployed to Vercel production target as `dpl_ADo5dbxksA44esyMQdwXLUDGyMTv`  
**Live site tested:** `https://anadyon-eight.vercel.app/`  
**Repository:** `anadyongr-droid/anadyon` (`main`)  
**Vercel project:** `prj_PARAIc4ZXqGZ3hLwghs9ew7Tzp8z` / team `Anadyon`  
**Supabase project:** `idfavwwfiuncoudkcfsp`, EU West 1, Postgres 17, status `ACTIVE_HEALTHY`

## Executive decision

**Recommendation: NO-GO. Do not launch publicly in the present state.**

The marketing site is visually coherent, responsive, fast at the HTML/CDN layer, indexable, and considerably more mature than a typical pre-launch site. Authentication uses server-validated Supabase sessions, role checks, and enforced TOTP MFA. Stripe and Resend webhooks verify signatures. Security headers are broadly present. Production dependencies have no currently reported npm vulnerabilities.

However, the connected live database currently allows the public `anon` role to execute five privileged (`SECURITY DEFINER`) functions. This is a confirmed authorization defect, not a code-style concern. One function can create arbitrary reservation records with attacker-controlled customer, price, status and source data; two can change statutory submission workflow state; one exposes invoice sequence information; and one can consume promo-code usage. These calls bypass the application’s reCAPTCHA, rate limits, server-side validation, role checks and normal RLS restrictions. This is a **Critical** release blocker.

Two further launch blockers are present: Stripe is not operational in the current production environment (three recent runtime errors state that no API key/authenticator was provided), and customer-facing age terms conflict (the shared booking terms say 21 for every driver, while the FAQ says 18 for motorbikes and bikes). The privacy notice also materially understates the processors and data categories actually used by the system.

No system can be certified “fully protected from hacking.” This report assesses observable controls and release risk. A top-grade posture additionally requires closing the findings, retesting, external legal review, credential/account controls that were not visible through the connected interfaces, and an independent penetration test.

## Scope and evidence

Read-only checks included:

- all 14 public routes at desktop width and nine primary routes at a 390×844 mobile viewport;
- live DOM, headings, metadata, canonical URLs, indexability, responsive overflow, touch-target indicators and runtime console state in the in-app Chromium browser;
- live HTTP response headers and uncached/cached request timings;
- the latest GitHub `main` checkout and security-sensitive application/API/migration files;
- connected Vercel project, deployment history and seven-day runtime error summaries;
- connected Supabase tables, RLS policies, function definitions/grants, and security/performance advisors;
- production dependency lockfile audit; and
- CI, deployment, SEO, cookie, privacy and terms configuration.

The audit did **not** modify code, GitHub, Vercel, Supabase or production data. It did not submit booking/contact/payment forms. It did not inspect secret values. Safari, Firefox, Edge and Samsung Internet were not available as native engines, so only Chromium was interactively automated; cross-engine conclusions combine standards/static review with Chromium desktop/mobile results and must be completed with a real device/browser matrix before launch. Formal Greek/EU legal advice, PCI assessment and a destructive penetration test were outside this read-only audit.

## Severity-ranked findings

### Critical

#### C-01 — Anonymous internet users can execute privileged database functions

**Evidence:** Supabase’s live security advisor reports externally facing `anon_security_definer_function_executable` warnings. A direct read-only grant query confirmed `anon_exec=true` and `authenticated_exec=true` for all five functions:

- `book_vehicle(...)`
- `claim_dcl_submission(uuid)`
- `claim_invoice_submission(uuid)`
- `next_invoice_aa(text)`
- `redeem_promo(text,numeric)`

The deployed function body for `book_vehicle` inserts directly into `reservations` from caller-controlled JSON, including customer identity, dates, totals, discount, status and source. There is no `auth.uid()`/role check. The baseline source is at `supabase/migrations/001_baseline.sql:314-464`. Migration `002_lock_down_anon_access.sql` correctly removes anonymous table policies but never revokes function execution, so the privileged RPC path remains open.

**Impact:** unauthenticated reservation fraud/data pollution; bypass of reCAPTCHA, rate limiting, pricing validation and admin authorization; arbitrary manipulation of invoice/DCL workflow flags; promo-code exhaustion; operational disruption and potential statutory/accounting consequences.

**Must fix:** immediately revoke `EXECUTE` from `PUBLIC`, `anon` and (unless explicitly required) `authenticated` for these functions. Grant only to `service_role`, or move private functions to a non-exposed schema. Add explicit authorization in every necessary definer function, set a safe fixed `search_path`, and make inputs map to a fixed column list. Apply through a reviewed migration. Re-run Supabase security advisors and verify every RPC returns permission denied with the public key. Rotate the public anon/publishable key only if logs show suspicious use; revocation is the actual control because that key is designed to be public.

**Release gate:** zero externally executable privileged functions except a documented, intentionally public function with an adversarial test.

### High

#### H-01 — Stripe deposit collection is not operational in production

**Evidence:** Vercel runtime errors recorded three failures on `/api/admin/stripe/create-payment-link` on 17 August: `Neither apiKey nor config.authenticator provided`. The latest commits add clearer messaging but do not prove a valid deployed key. Code uses an empty string when `STRIPE_SECRET_KEY` is absent (`lib/stripe.ts:3-11`).

**Impact:** staff cannot create deposit links; go-live booking conversion/payment operations fail. Webhook correctness cannot compensate for a missing secret.

**Must fix:** save the correct live/test Stripe key in the intended Vercel production environment, confirm account/card capability activation, confirm `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_SITE_URL`, redeploy, execute one controlled end-to-end test in Stripe test mode, verify idempotent repeat clicks, webhook delivery, reservation status/deposit timestamp, refund/cancellation handling and operator-visible reconciliation. Do not launch until the system proves the intended live-vs-test mode.

#### H-02 — Privacy notice does not describe the real processing ecosystem

**Evidence:** `app/privacy-policy/page.tsx` names Google Analytics and reCAPTCHA, then uses a generic paragraph for all other providers. The code and architecture process or transmit data through Supabase, Vercel, Resend, Gmail/Google APIs, Telegram, Twilio, Stripe, Wise, Anthropic, Apify and AADE. The database contains identity/contact data, DOB, address, licence/passport information, emergency contacts, financial/payment references, communications, vehicle damage/documents and operational records. These are not adequately itemised. International transfer safeguards, recipient categories, retention by data category, security/incident contact, controller’s legal identity/company identifiers, and automated AI email classification are not clearly disclosed.

**Impact:** consent/transparency deficiencies under GDPR; customers cannot understand recipients, transfers, purposes or retention; elevated complaint/regulatory risk.

**Must fix:** have Greek/EU counsel review a provider-specific data map and rewrite the notice. State the controller’s full legal name/trading name, tax/company details where applicable, purposes and Article 6 bases per data category, recipients/processors, international transfers and safeguards, retention schedules, data sources, profiling/AI use, statutory/contractual necessity, rights and complaint route. Confirm DPAs/SCCs and data-region settings with every processor.

#### H-03 — Contractual driver-age rules contradict each other

**Evidence:** `app/terms/page.tsx` and the shared modal in `app/components/BookingForm.tsx:78-90` state “Minimum driver's age is 21 years” without vehicle qualification. `app/faq/FaqClient.tsx:12-13` says cars require above 21 while motorbikes and bikes require 18. “Above 21” itself means 22+, unlike “minimum 21.”

**Impact:** customers may accept terms that conflict with eligibility shown elsewhere; rejected rentals, disputes, chargebacks and unfair-commercial-practice risk.

**Must fix:** define one approved age matrix by vehicle class, licence class, years held and surcharge. Use exact “at least” language and source all pages/form validation/emails from that policy. Legal review is required.

#### H-04 — Rate limiting is not robust at Vercel scale

**Evidence:** `lib/rateLimit.ts` uses an in-memory `Map` and explicitly notes it is only sufficient for a single region. Vercel Functions can run across instances and cold starts, so counters reset and do not coordinate. The public quote/contact/promo paths therefore do not have a durable global throttle. The quote lookup uses Supabase-backed progressive blocking, which is stronger, but successful lookup resets the IP’s failures and the reference is only six characters plus surname.

**Impact:** spam/email cost, brute-force attempts, promo enumeration and resource abuse. reCAPTCHA reduces but does not remove this risk.

**Must fix:** use a durable atomic rate-limit store or Vercel Firewall/managed rate limiting; key on trustworthy platform IP plus endpoint/identity; cap body sizes and concurrency; add bot management/monitoring and alert thresholds; separately throttle quote reference lookups without allowing one success to erase unrelated failures.

#### H-05 — Production readiness is not enforced as a release gate

**Evidence:** Vercel reports the project `live: false` while deployments target `production` and domains include `anadyon.gr`, `www.anadyon.gr` and three Vercel aliases. CI’s schema-drift step passes when secrets are absent, so a release can be green without checking the actual database. No CI security scan, end-to-end booking/payment test, browser matrix, accessibility test or deployment smoke test is defined. Recent runtime logs also show two 60-second timeouts for email sync/reclassification.

**Impact:** green builds can ship a broken payment path or schema/security drift; unclear canonical production hostname and promotion process; operational failures may be found by staff/customers.

**Must fix:** establish one production domain and redirect all aliases; document whether `live: false` is intentional and validate domain/DNS/TLS; require schema/security-advisor gates; add post-deploy smoke tests and a rollback owner; break long email tasks into bounded/resumable work; retain logs and alerts beyond the short current window.

### Medium

#### M-01 — CSP is present but cannot support a top security grade

The live CSP includes `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'`; `img-src https:` permits every HTTPS host. `X-Frame-Options: SAMEORIGIN` contradicts CSP `frame-ancestors 'none'` (modern browsers use CSP, but policy should be unambiguous). Missing hardening includes a nonce/hash-based script policy, narrower third-party origins, `upgrade-insecure-requests`, and considered COOP/CORP controls. HSTS, nosniff, referrer and permissions policies are good.

**Fix:** move inline scripts (including JSON-LD/GA) to nonces or hashes supported by the chosen Next.js architecture; narrow sources; align clickjacking headers; deploy CSP in report-only first with reporting, then enforce. Do not chase an A+ score at the cost of breaking reCAPTCHA—verify every flow.

#### M-02 — Dark mode is styled but not fully product-ready

Tailwind `dark:` coverage is widespread and CSS responds to `prefers-color-scheme`; however, live computed `color-scheme` was `normal`, no `<meta name="color-scheme">` exists, and there is no user toggle/persisted preference. Native form widgets and browser chrome are therefore not formally opted into dark rendering. The JPEG logo requires a conspicuous white plate in dark mode.

**Fix:** set `color-scheme: light dark`, test every input/select/date picker/reCAPTCHA/modal/table at both schemes, add a system/light/dark control if desired, persist without a flash, and replace the JPEG logo with transparent SVG/PNG. Test forced colors and contrast, not only appearance.

#### M-03 — Cookie withdrawal and classification need improvement

Prior blocking of Google Analytics works: GA scripts render only after “Accept all,” and decline/essential choices are offered. But changing consent requires clearing site storage rather than an always-available preferences control. The notice calls a localStorage entry a “cookie,” omits lifetimes/providers in sufficient detail, and reCAPTCHA may contact Google before analytics consent without a clearly separated strictly-necessary justification.

**Fix:** persistent “Cookie settings” control, direct withdrawal as easy as acceptance, accurate storage/provider/duration table, version/timestamp the consent record, and document reCAPTCHA’s legal basis and data transfer. Validate that no non-essential network request/storage occurs pre-consent.

#### M-04 — Contract terms are too thin for vehicle rental go-live

Terms omit or under-specify deposit/payment timing, security deposit/card preauthorisation, fuel policy, excess amounts per cover, exclusions and negligence, geographic/road/ferry restrictions, additional drivers, late return/extension, breakdown/accident procedure, traffic fines/admin fees, cleaning/smoking/pets, vehicle substitution, no-show, refund timing, governing court/ADR/consumer complaint mechanisms, condition/handover evidence and e-bike/bicycle liability. Cancellation wording says “free” but also states a deposit is due on confirmation without explaining refund treatment.

**Fix:** legal/insurance review and a single versioned rental policy. Show the exact version accepted and preserve acceptance timestamp/version with each quote/reservation.

#### M-05 — SEO foundation is good, but content/schema coverage is incomplete

All tested pages had one H1, descriptions, index/follow and self-canonicals pointing to `https://anadyon.gr`. Robots and sitemap exist. `LocalBusiness` JSON-LD is present. Gaps: sitemap omits `/blog` and the human `/sitemap`; every sitemap request assigns “now” as every page’s modification time; schema uses generic `LocalBusiness` rather than more specific, validated types and has empty `sameAs`; no FAQ structured data; thin one-entry blog; no hreflang/localized Greek content; vehicle/category pages lack richer offer/service schema and local-area content. The preview host is indexable while canonicalising to a domain that may not yet be live.

**Fix:** launch canonical domain first and redirect/deindex aliases; use real last-modified dates; include all intended indexable pages; validate JSON-LD in Google tools; add `FAQPage` only for visible FAQ content; add authentic local content/internal links and organization profiles; decide English/Greek language strategy; connect Search Console/Bing and monitor coverage/Core Web Vitals.

#### M-06 — Accessibility and mobile touch targets require a focused pass

No horizontal overflow was detected at 390px or desktop. The hamburger is correctly labelled and sized. The automated geometry check still found small interactive targets on every tested mobile page (up to 10 on Contact and nine on Privacy), commonly inline legal/contact links and form controls. Cookie banner can occupy a meaningful portion of a small viewport. The audit did not find automated axe testing, keyboard regression tests, skip links, or explicit error summaries/live regions.

**Fix:** WCAG 2.2 AA audit with axe plus keyboard/VoiceOver/TalkBack; enlarge primary/adjacent targets, add skip-to-content, confirm visible focus, field labels/instructions, error announcement, accordion semantics, modal focus trap/return and 200% zoom/reflow. Test cookie UI at 320px and landscape.

#### M-07 — Backup, recovery and incident readiness are unproven

The connected project confirms a healthy database but exposes no evidence of PITR/backups, restore drills, retention, encrypted exports, RPO/RTO, webhook replay, secret rotation, incident contacts or disaster runbooks. Application migrations exist, but migration history alone is not a data backup.

**Fix:** verify plan-specific automated backups/PITR; perform a restore drill into an isolated project; document RPO/RTO, owners, Stripe/Resend webhook replay, domain/DNS recovery, Vercel rollback and Supabase outage mode; export configuration and protect recovery credentials with MFA.

#### M-08 — Browser compatibility is not demonstrated

Chromium desktop/mobile passed basic render/navigation/overflow checks. The application uses standard React/Next.js primitives and native inputs, so broad compatibility is plausible, but no BrowserStack/Sauce/real-device CI exists. Safari-specific date inputs, sticky/overflow modal behavior, reCAPTCHA, `dvh`/safe areas, dark native controls and iOS keyboard scrolling remain unverified; Firefox and Samsung Internet were also not run.

**Fix:** execute the matrix in the checklist below and record browser/version/device/evidence. Include actual payment return/deep-link and mobile keyboard flows.

### Low

#### L-01 — Design and content polish

- The home page is clear and trust-oriented, but the hero image is visually dominant and the booking CTA sends users to category pages rather than a single obvious quote flow.
- Fleet imagery has inconsistent source ratios/backgrounds; dark mode compensates rather than using brand-ready assets.
- “Blog” currently appears thin and may reduce perceived completeness if promoted in the main navigation.
- “My Rental” page title is “Find Your Quote,” while the UI says “My Rental”; align terminology across navigation, emails and pages.
- Footer and inline legal links dominate mobile navigation once the header menu is closed; confirm information hierarchy with user testing.

#### L-02 — Repository/dependency hygiene

The production lockfile audit reported zero known vulnerabilities across 208 production dependencies (18 August 2026). Versions use caret ranges but the committed lockfile makes installs deterministic. Add Dependabot/Renovate, CodeQL/SAST, secret scanning, dependency review and SBOM generation. GitHub’s latest commit is marked unverified; require signed commits/branch protection/reviews for production. Unused starter SVG assets remain in `public/`.

#### L-03 — Database performance hygiene

Supabase’s performance advisor reports unindexed foreign keys on `emails.customer_id`, `quotes.customer_id`, and `reservations.customer_id`, `promo_code_id`, and `vehicle_id`. Add indexes based on actual query plans. “Unused” index warnings are not actionable yet because the database is new; re-evaluate after realistic traffic.

## Review by requested area

| Area | Assessment | Release state |
|---|---|---|
| 1. Mobile vs desktop | Responsive layout and no horizontal overflow at tested widths; hamburger/touch target and small-screen cookie/form refinements remain | Conditional |
| 2. Design | Coherent branding and hierarchy; inconsistent imagery, thin blog, CTA/terminology polish | Can follow after blockers |
| 3. Deep security | Strong auth/MFA/header/webhook foundations, but confirmed anonymous privileged RPC exposure | **Blocker** |
| 4. User-friendliness | Clear value proposition and category journeys; long booking/legal flow and mobile/accessibility friction | Must test end-to-end |
| 5. Content/legal | Material age contradiction and incomplete privacy/contract disclosures | **Blocker** |
| 6. Security grade | Good base headers; cannot claim top grade with critical DB grant, inline CSP, weak distributed throttling and unproven ops | **Blocker** |
| 7. SEO | Good fundamentals; alias/indexability, sitemap freshness/completeness, schema and content depth gaps | Conditional |
| 8. Performance | CDN HTML TTFB ~0.08–0.21s in sampled requests; public images 16–456KB with Next/Image; CWV/RUM and email timeouts remain | Conditional |
| 9. Dark mode | Broad CSS support, but no formal color-scheme opt-in/toggle and incomplete native/cross-browser verification | Conditional |
| 10. Browsers | Chromium desktop/mobile baseline passed; Safari/Firefox/Edge/Samsung native verification outstanding | **Pre-launch test required** |

## Performance evidence

Sampled live HTML responses returned HTTP 200 throughout. TTFB ranged approximately 0.079–0.105s for most core pages; `/terms-of-use`, `/robots.txt` and `/sitemap.xml` were approximately 0.20–0.22s. HTML sizes ranged about 22–46KB. The home page was a Vercel cache hit. Static source images range from 16KB to 456KB, and category images use Next/Image; apparent `naturalWidth=0` records in the DOM sweep were lazy images below the viewport, not confirmed broken images.

This is a strong delivery baseline, but it is **not a Core Web Vitals certification**. Lighthouse CrUX/RUM data was not available. Add Vercel Speed Insights or another consent-aware RUM solution and measure p75 LCP, INP and CLS on real mobile traffic. The 60-second email sync/reclassification timeouts are backend performance failures and should be redesigned before they become operational bottlenecks.

## Security-control positives

- Admin proxy validates users with `auth.getUser()`, removes the client-supplied role header, uses `app_metadata`, enforces verified TOTP/AAL2 and separates staff/admin routes.
- Sensitive admin APIs are under the proxy matcher; staff is denied Stripe, invoicing, SMS, stats and AADE routes.
- Stripe webhook verifies the raw body signature; Resend webhook fails closed without its signing secret.
- Public booking pricing is recalculated server-side from database rates and reCAPTCHA is checked.
- RLS is enabled; live public policies are limited to read-only rates/extras, with quotes explicitly denied. The defect is the function grants, not wholesale table exposure.
- HSTS (two years, includeSubDomains, preload), nosniff, restrictive permissions policy, referrer policy, CSP and frame protection are deployed.
- The repository is public but no plaintext secret was found in the reviewed source; server secrets are not intentionally placed in `NEXT_PUBLIC_*` variables.
- npm reports no known production dependency vulnerabilities in the lockfile.

## Must fix before go-live

1. Revoke public/authenticated execution of all five privileged Supabase functions; migrate, rerun advisors and adversarially retest with the public key.
2. Audit every function/view/storage policy and ensure no additional definer or column exposure; enable a release check that fails on new external lints.
3. Restore and prove Stripe configuration end to end in the correct environment/mode, including webhook and reconciliation.
4. Resolve the age/eligibility contradiction and obtain legal/insurance approval for the complete rental terms.
5. Rewrite/privacy-review the data map and notice for all processors, categories, transfers, retention and AI processing; verify DPAs/SCCs.
6. Replace in-memory throttles with durable/managed controls and add endpoint/body/concurrency protections.
7. Establish the canonical production domain, redirects, DNS/TLS, deploy/promotion/rollback procedure and clarify Vercel `live: false`.
8. Run a real-device/browser test matrix and WCAG 2.2 AA pass; fix blocking issues.
9. Verify backups/PITR and complete a restore drill; document RPO/RTO and incident ownership.
10. Make CI/release checks mandatory: build, lint, unit tests, real schema drift, Supabase security advisor, smoke test and booking/payment test.

## Can follow shortly after launch (only after the gate above passes)

- nonce/hash CSP hardening and report collection;
- persistent cookie-settings control and consent record versioning;
- richer SEO schema, real sitemap dates, localized content and Search Console monitoring;
- user-selectable dark mode and transparent logo assets;
- category imagery consistency and booking CTA simplification;
- database foreign-key indexes based on query plans;
- durable/background architecture for mailbox sync/classification;
- SBOM, signed commits, CodeQL, Dependabot and broader supply-chain policy;
- RUM/Core Web Vitals dashboards, alerting and longer log retention.

## Pre-launch verification checklist

### Security and operations

- [ ] Supabase security advisor has no unexpected external warnings.
- [ ] Public key receives permission denied for all private RPCs/tables/storage.
- [ ] Admin and staff role matrix tested with fresh and stale JWTs; MFA setup, recovery and offboarding tested.
- [ ] Vercel/GitHub/Supabase/Google/Stripe account MFA and least-privilege memberships reviewed.
- [ ] Secrets are unique per environment, encrypted, owner-documented and rotation-tested; no production secrets in preview.
- [ ] Stripe/Resend webhook signatures, replay/idempotency and failure alerts tested.
- [ ] Firewall/rate-limit/bot rules tested without blocking legitimate customers.
- [ ] Backup restore and Vercel rollback drills pass within declared RTO/RPO.
- [ ] Incident runbook lists owners, regulator/customer notification path and evidence preservation.

### Customer, legal and booking

- [ ] One authoritative age/licence/insurance/pricing/cancellation policy appears everywhere.
- [ ] Legal entity, VAT/company identity and required Greek e-commerce/business disclosures are approved.
- [ ] Privacy notice and cookie inventory match actual production network/storage behaviour.
- [ ] Consent is freely given, granular, recorded and as easy to withdraw as to give.
- [ ] Quote → email → lookup → confirmation → deposit → webhook → reservation → cancellation/refund flow passes.
- [ ] Prices, VAT, extras, deposit, balance, excess and refund terms match across UI, email, Stripe and admin.
- [ ] Failed email/SMS/payment/webhook states are visible and recoverable by staff.

### Browser/device matrix

- [ ] Chrome current/previous on Windows and Android.
- [ ] Safari current/previous on macOS and real iPhone/iPad.
- [ ] Edge current/previous on Windows.
- [ ] Firefox current/previous on Windows/macOS.
- [ ] Samsung Internet current on a Galaxy device.
- [ ] 320px, 375/390px, tablet portrait/landscape, 1366px and 1920px layouts.
- [ ] Light/dark/high-contrast, 200% zoom, keyboard-only, VoiceOver and TalkBack.
- [ ] Native date/select inputs, mobile keyboard, sticky header, modals, cookie panel and reCAPTCHA.

### SEO/performance

- [ ] All aliases 301 to one HTTPS canonical host; preview deployments are not indexed.
- [ ] Robots and sitemap point to the live canonical host and contain intended indexable pages only.
- [ ] Metadata, OG/Twitter cards and JSON-LD validate.
- [ ] No broken links/images or console errors across the route inventory.
- [ ] Mobile Lighthouse lab checks and real-user p75 CWV meet launch targets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1).
- [ ] Search Console/Bing ownership, analytics consent behaviour and error/performance alerts verified.

## Final release gate

Anadyon can move from **NO-GO** to a controlled **GO** only after C-01 and all High findings are fixed, the “must fix” checklist is evidenced, and a short independent retest confirms the fixes on the actual production deployment and database. The anonymous function grants alone are sufficient to block launch today.
