# Anadyon post-launch audit

**Audit date:** 19 August 2026  
**Production site:** https://anadyon.gr  
**Repository:** `anadyongr-droid/anadyon`  
**Production revision:** `4ff434d2ece28a8a70136a8b4036a8a176f1c041`  
**Production deployment:** `dpl_7HTXgPzuVEGMZCbA4w4nXEYzPC3V` (READY)  
**Method:** read-only live testing, production-header/API probes, repository review, build/static checks, Vercel runtime inspection and Supabase security/schema inspection. No production data, deployment, DNS, settings or source code was changed.

## Executive conclusion

**Recommendation: CONDITIONAL GO / remain live, with urgent remediation and close monitoring.**

The public site is available, fast in the tested European location, usable at desktop and mobile widths, bilingual, and substantially more secure than the earlier audit state. The former critical Supabase privilege exposure is closed: all five privileged functions are restricted to `postgres` and `service_role`, and anonymous calls are denied. Authentication, MFA enforcement, route protection, RLS, webhook validation, security headers, consent-gated analytics, canonical redirects and build quality are generally strong.

No new Critical finding was identified. One High operational finding remains: the Resend webhook signing secret is missing in production, so delivery-failure events cannot be authenticated or processed. Several Medium findings prevent describing the system as “highest-grade” or fully verified: excessive underlying database grants, disabled leaked-password protection, incomplete migration/CI assurance, incomplete privacy wording, a quote-indexing issue, incomplete hreflang metadata, and lack of a real production end-to-end booking/payment proof after the latest deployment.

Core technical checks passed: **105/105 unit tests**, TypeScript, production build, translation check, runtime dependency audit, and static accessibility scan. All **26 sitemap URLs returned HTTP 200**. Public HTML response time in the audit location was approximately **0.08–0.38 seconds**. These are strong signals, but not substitutes for real-user Core Web Vitals, native-browser/device coverage, or a controlled end-to-end transaction.

## Severity-ranked findings

| ID | Severity | Finding | Evidence / impact | Required action |
|---|---|---|---|---|
| H-01 | **High** | Resend webhook is not operational in production | An unauthenticated negative probe correctly returned `503 {"error":"Webhook signing secret not configured"}`; the current deployment logged `RESEND_WEBHOOK_SECRET is not set; rejecting`. Bounce, complaint and delay notifications therefore cannot be trusted/processed. | Add the exact Resend webhook signing secret to Production, redeploy, send Resend test events, and verify valid=2xx, bad signature=401, malformed body=400. Rotate the secret if it has ever appeared outside the secret manager. |
| M-01 | **Medium** | Latest production booking/payment journey lacks a controlled end-to-end proof | Unit/build checks pass and public validation was tested, but a real booking was not submitted because it would create customer/operational records, send communications and requires an interactive CAPTCHA. Stripe payment and AADE issuance were not triggered. | Run one pre-authorised synthetic reservation with a clearly labelled test identity and vehicle/date window; verify reservation, quote email, admin state, deposit checkout, signed Stripe webhook, confirmation, invoice/AADE state, cancellation/refund and cleanup. Record IDs and timestamps. |
| M-02 | **Medium** | Supabase underlying grants are broader than least privilege | RLS is enabled and currently blocks public row access, but `anon`/`authenticated` retain broad table privileges on many business tables (including write and ancillary grants). A future policy mistake would have a larger blast radius. | Revoke unnecessary privileges from `anon` and `authenticated`; grant only the two intentional public rate/config reads and the minimum Auth/Storage access. Keep business writes service-side. Add an automated grant/RLS regression test. |
| M-03 | **Medium** | Supabase leaked-password protection is disabled | Supabase security advisor reports this warning. MFA reduces admin risk, but password reuse remains avoidable exposure. | Enable leaked-password protection; confirm both admin/staff accounts use unique passwords. Keep mandatory TOTP and retain recovery procedures. |
| M-04 | **Medium** | Database migration history is not auditable through Supabase | The live schema is populated, but the migration listing is empty. This weakens repeatability, drift detection, disaster recovery and incident reconstruction. | Reconcile repository migrations with production, baseline the live database in the migration-history table, then require migrations through CI/deployment workflow. Test restore into a non-production project. |
| M-05 | **Medium** | CI does not exercise the full system and differs from production runtime | `.github/workflows/ci.yml:15-18` uses Node 20 while production reports Node 24; `tests/e2e/*` is not run; schema drift silently skips without secrets (`ci.yml:49-70`). | Pin the same supported Node major in CI and Vercel, add a safe isolated E2E job, and make schema verification mandatory for schema-dependent releases using a tightly scoped non-production project. |
| M-06 | **Medium** | Privacy notice is incomplete for the actual processor/data-flow inventory | `lib/i18n/content/legal.ts:243+` names Google Analytics/reCAPTCHA but describes other processors only generically. The system also uses Vercel, Supabase, Resend and Stripe, and may use Twilio/Telegram/AADE. International-transfer safeguards, payment data handling, security measures, breach/contact procedures and the full recipient inventory are not explicit. Retention claims should match automated deletion/backups and Greek tax obligations. | Have Greek/EU counsel validate both languages; enumerate actual processors, purposes, data categories, locations/transfers and safeguards; distinguish Stripe-hosted card processing; explain backups/logs; document children/driver-age handling and rights workflow. Maintain a processor register and DPAs. |
| M-07 | **Medium** | Public quote lookup is intentionally indexable | `app/quote/layout.tsx:5-10` sets `robots.index: true`. The dynamic quote page is `noindex`, but the lookup landing is a low-value account-like page and `/quote/` in robots does not reliably cover `/quote`. | Set `/quote` to `noindex, follow` (or `noindex, nofollow`), keep dynamic quote URLs out of the sitemap, and use metadata rather than robots.txt as the primary exclusion. |
| M-08 | **Medium** | Hreflang is missing from six English pages | Live inspection found no HTML alternate-language links on `/`, `/cars`, `/motorbikes`, `/bikes`, `/faq`, and `/quote`; their Greek counterparts or the sitemap do declare pairs. Relevant sources only specify canonical on several pages, e.g. `app/cars/page.tsx`, `app/motorbikes/page.tsx`, `app/bikes/page.tsx`, `app/faq/page.tsx`. | Add `languages: { en, el }` consistently and consider `x-default`. Add a metadata regression test across every locale pair. |
| M-09 | **Medium** | Real-browser compatibility evidence is incomplete | Automated interactive inspection used the available Chromium-based in-app browser. Native Safari/WebKit, Firefox/Gecko, Edge, iOS Safari, Android Chrome and Samsung Internet were not all available in this environment. No incompatibility was observed, but “works on top 5–6 browsers” cannot be certified from one engine. | Add Playwright Chromium/Firefox/WebKit desktop plus representative mobile projects in CI; perform BrowserStack/Sauce Labs tests on current iOS Safari, Android Chrome and Samsung Internet. Test booking, date controls, CAPTCHA, payment redirect, cookies, language and dark mode. |
| M-10 | **Medium** | Dark mode is code-ready but not fully certified | Source contains 307 dark-mode utilities across public/admin components and no overflow was seen at tested widths, but the browser session reported light preference and could not provide native cross-browser/device dark-mode proof. | Add automated light/dark visual snapshots at 390, 768 and 1280 widths; manually verify Safari/iOS form controls, CAPTCHA, focus indicators, logos/images, admin tables, quote/payment states and print/PDF output. |
| L-01 | **Low** | Enforced CSP still permits inline scripts | `next.config.ts:36-67` enforces a strong CSP but retains `script-src 'unsafe-inline'`; a stricter report-only policy is collecting migration evidence. | Complete nonce-based Next.js CSP migration after analysing reports; then remove `unsafe-inline` from the enforced policy. |
| L-02 | **Low** | CSP report receiver can be used for log noise | `app/api/csp-report/route.ts:32-66` accepts unauthenticated JSON with no explicit body limit or request throttling. Fields are sliced and deduplicated, limiting impact, but request volume can still consume runtime/log capacity. | Enforce a small content-length/body limit, validate report shape, sample/rate-limit at the edge, and avoid alerting directly on untrusted reports. |
| L-03 | **Low** | Development toolchain advisories remain | Runtime-only `npm audit --omit=dev` returned zero vulnerabilities. Full audit returned 20 dev/tooling advisories (19 high, 1 moderate), primarily lint/build transitive dependencies. | Upgrade the affected tooling without weakening checks; use lockfile review and dependency update automation. Treat CI as privileged because dev dependencies execute there. |
| L-04 | **Low** | Lint debt remains | `npm run lint` completed with zero errors and 44 warnings, primarily effect-state/dependency issues and unused values in admin UI. | Clear warnings incrementally, prioritising hooks that may create stale state or unnecessary rerenders. Enforce a warning budget in CI. |
| L-05 | **Low** | Cookie notice wording does not match the improved UI | The policy says users must clear local storage to change consent, but the footer now directly reopens preferences (`CookieBanner.tsx:11-14, 26-38`). | Update both legal-language versions to say “Cookie settings” can be used at any time; describe localStorage accurately as storage, not a cookie. |
| L-06 | **Low** | Sitemap alternates omit `x-default` | `app/sitemap.ts:60-81` correctly declares English and Greek pairs but no fallback. | Add an `x-default` URL (normally English/root) after confirming the preferred fallback strategy. |

## Security posture

### What is strong

- All reviewed business tables in `public` and `storage` have RLS enabled.
- Public database access is intentionally limited at policy level to rate/config reads; quote access is not public.
- The five formerly exposed `SECURITY DEFINER` functions now grant execution only to `postgres` and `service_role`. Anonymous probes return permission denied.
- `/admin` and admin pages redirect to login; unauthenticated reservation, customer, statistics, vehicle, Stripe, AADE, invoice, SMS and cron endpoints returned 401.
- `proxy.ts` discards client-supplied role headers, validates the Supabase user, resolves role server-side, enforces TOTP MFA and restricts staff-only surfaces.
- Stripe webhook rejects missing/invalid signature paths. Resend’s handler now uses appropriate 401/400/503 response classes and constant-time signature comparison; its production secret remains the blocker.
- Live headers include two-year HSTS with preload, CSP, `nosniff`, restrictive referrer and permissions policies, and anti-framing controls.
- Images are self-hosted and CSP `img-src` is limited to self/data/blob. Canonical `www` traffic is now permanently redirected to the apex while preserving path/query.
- CAPTCHA, API validation and rate limiting exist on public mutation flows. Note that the rate limiter intentionally fails open on database errors, making CAPTCHA and monitoring important compensating controls.
- Runtime dependency audit is clean.

### Grade

**Current application-security posture: B+ / approaching A-.** This is not a certification and no external penetration test was performed. Achieving a defensible top-grade posture requires resolving H-01 and M-01–M-05, enforcing least privilege, completing CSP hardening, adding WAF/rate-limit evidence, testing backups/restores, continuously scanning dependencies/secrets, and commissioning an independent authenticated penetration test.

### Operational security and recovery

The audit confirmed deployment readiness and inspected current runtime errors, but it did not execute a destructive restore. A production-grade runbook should define owners and tested procedures for: Vercel rollback; Supabase point-in-time/database restore; Storage recovery; secret rotation; compromised administrator; Stripe/Resend webhook replay; customer notification/data breach; DNS rollback at Papaki; and degraded operation when email, payment, CAPTCHA or Supabase is unavailable. Test restores quarterly and record recovery time/recovery point results.

## UX, responsive design and visual review

- At **1280 px desktop** and **390×844 mobile**, tested public pages showed no horizontal overflow. Navigation changes appropriately to mobile controls.
- Primary “Get Quote” controls were at least 44×44 px in the inspected mobile view, a good touch target.
- The booking UI clearly labels the action as a quote request and separates estimate, deposit and balance. The rate-card failure state now offers a retry instead of silently removing pricing.
- English/Greek route coverage is broad and the translation checker found no missing keys or hard-coded text in the checked translated components.
- Static accessibility scanning found no axe-detectable issue across 28 generated pages. This does **not** certify colour contrast, keyboard order, announcements, zoom/reflow or screen-reader quality.

Remaining usability work should focus on real-customer observation: instrument funnel stages without collecting unnecessary personal data; review mobile keyboard/input types and autofill; test date selection around midnight/time zones; preserve entered data after retry; explain quote versus confirmed booking before submission; and give clear recovery paths for CAPTCHA, email, payment and availability failures.

## Content, pricing and legal consistency

The core commercial wording is internally consistent in the reviewed sources: quoted fees include taxes, standard insurance is described consistently, cancellations over 24 hours are free and later cancellations cost one rental day, and the driver-age rule derives from a shared constant rather than duplicated text. The Greek translation check passed.

The legal pages cover controller identity/contact, categories and purposes, Article 6 legal bases, principal retention periods, rights, complaint to the Greek DPA, analytics consent and basic third-party processing. This is a solid baseline, not legal approval. Counsel should confirm the precise legal entity/trading details, Greek consumer/e-commerce rules, rental and insurance exclusions, withdrawal/cancellation rules, deposit/refund timelines, VAT/price presentation, AADE documentation, retention periods, international transfers and processor disclosures. Operational practices must match the published notice.

Cookie behaviour is substantively good: analytics loads only after “Accept all”; decline/essential choices are available; choice, timestamp and policy version are recorded locally; and preferences can be reopened from the footer. Update the notice wording as L-05 describes and verify that no Vercel/third-party analytics or marketing integration bypasses this consent design.

## SEO

### Passed

- All 26 sitemap URLs returned 200.
- Each of the 26 inspected public pages had a title, description, canonical, language, one H1, structured data, non-empty links and no missing image alt text in the rendered DOM.
- `robots.txt` points at the sitemap and excludes admin/API and quote-detail paths.
- Canonical host redirect now sends `www` to apex with HTTP 308 and preserves path/query.
- Sitemap provides paired English/Greek URLs and deliberate last-modified dates.
- LocalBusiness structured data is present; FAQ adds FAQ schema.

### Improve

Resolve M-07, M-08 and L-06. Then connect Google Search Console and Bing Webmaster Tools, submit the sitemap, monitor coverage/canonical/hreflang reports, verify the Google Business Profile and consistent name/address/phone data, add useful destination/fleet content rather than thin pages, strengthen contextual internal links, and review query/impression data monthly. Validate structured data after every content-model change.

## Performance

Public HTML responses from the audit’s European network location completed in approximately 0.08–0.38 seconds across the 26 sitemap pages. HTML documents were roughly 22–48 KB. The `public` directory is about 2.4 MB total with no individual source asset over 500 KB. Next Image is configured for AVIF/WebP and shared public images receive caching headers.

This is a good lab baseline, but it is not a Core Web Vitals result. Enable/retain Vercel Speed Insights or equivalent consent-compatible real-user monitoring and wait for sufficient field data. Track p75 LCP, INP and CLS separately for mobile/desktop and by route. Add bundle budgets, image-dimension checks, font-display checks and Lighthouse CI as regression gates. Pay particular attention to CAPTCHA/Google scripts and the quote form, which can dominate real-user work even when server HTML is fast.

## Browser and dark-mode compatibility matrix

| Target | Evidence this audit | Status |
|---|---|---|
| Chromium-based desktop | Live interactive checks, responsive DOM/layout | Passed for inspected paths |
| Mobile responsive viewport | Live 390×844 checks, touch-target and overflow review | Passed for inspected paths |
| Edge | Standards/code review only | Needs native/hosted run |
| Firefox desktop/mobile | Standards/code review only | Needs Gecko run |
| Safari macOS/iOS | Standards/code review only | Needs WebKit and physical-device run |
| Android Chrome | Responsive emulation only, not a physical device | Needs native run |
| Samsung Internet | Not available in audit environment | Needs hosted/physical-device run |
| Dark mode | Broad source coverage; no system-dark session | Needs light/dark visual regression and native verification |

Test at minimum the home/fleet pages, mobile menu, language toggle, cookie choices/withdrawal, quote lookup, full booking, CAPTCHA, Stripe redirect/return, admin login/MFA, date controls, form validation, keyboard navigation, zoom 200%, print/PDF and offline/error recovery.

## Test evidence

| Check | Result |
|---|---|
| Production deployment | READY, commit `4ff434d…` |
| Unit suite | 105/105 passed |
| TypeScript | Passed |
| Production build | Passed; 85 routes generated |
| Lint | 0 errors, 44 warnings |
| Translation audit | 14 Greek pages, 0 problems, 0 hard-coded translated-component strings |
| Static accessibility audit | 28 pages, no detected issues; documented limitations apply |
| Runtime dependency audit | 0 known production vulnerabilities |
| Full dependency audit | 20 dev/tooling advisories |
| Sitemap crawl | 26/26 returned 200 |
| Public/admin access controls | Expected redirects/401s observed |
| Current-deployment runtime errors | One deliberate audit event for missing Resend secret; earlier rate JWT errors were on previous deployment |
| Supabase health | ACTIVE_HEALTHY, Postgres 17.6, EU region |
| RLS | Enabled on reviewed public/storage tables |
| Privileged function exposure | Closed; service role/postgres only |
| MFA | Proxy-enforced TOTP; 1 verified factor found across 2 role-bearing users, so verify second-user enrolment/recovery before operational reliance |

## Must fix urgently while live

1. Configure and positively test `RESEND_WEBHOOK_SECRET` (H-01).
2. Execute and document one controlled, end-to-end production reservation/payment/notification test (M-01), with explicit approval for the transaction and cleanup.
3. Revoke excessive Supabase grants and add regression checks (M-02).
4. Enable leaked-password protection and verify MFA enrolment/recovery for every admin/staff user (M-03).
5. Reconcile migration history and prove a non-production restore (M-04).
6. Obtain Greek/EU legal review and correct the processor/transfer/retention/cookie disclosures (M-06).
7. Make the quote lookup `noindex` and complete the missing English hreflang metadata (M-07/M-08).
8. Put live alerts on booking failures, payment/webhook failures, email failures and cron timeouts; define an on-call owner and rollback trigger.

## Can follow shortly after launch

1. Align CI and production Node versions; add isolated E2E, browser matrix, schema gate and Lighthouse budgets.
2. Complete native Safari, Firefox, Edge, iOS, Android Chrome and Samsung Internet testing.
3. Add automated light/dark visual regression and manual accessibility testing with keyboard and screen readers.
4. Remove CSP `unsafe-inline` after nonce migration; protect the CSP report endpoint.
5. Upgrade development dependencies and clear lint warnings.
6. Add `x-default`, Search Console/Bing monitoring and monthly SEO/content review.
7. Collect at least 28 days of real-user Core Web Vitals and optimise from p75 route/device data.
8. Commission an independent external penetration test and repeat it annually or after material architecture changes.

## Audit limitations

This was a substantial evidence-based audit, not a guarantee that hacking is impossible or a legal certification. CAPTCHA prevented non-interactive production submission, and the audit deliberately did not create reservations, charge cards, issue tax documents, send customer messages, restore backups, alter firewall settings or mutate production data. Native browser/device services and an independent external penetration-testing scanner were not available. Those limitations are explicitly converted into actions above rather than treated as passed checks.
