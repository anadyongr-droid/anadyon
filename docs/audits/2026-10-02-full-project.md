# Full-project audit — 2 October 2026

**Last verified:** 2 October 2026, Codex.

## Verdict

The project is substantially stronger than it was at the first audit. The
August critical access-control failures are closed, the current production
dependency tree has no known npm advisories, the live databases are locked
down, the public site is fast and usable, and the current `main` commit passed
GitHub CI, hosted staging E2E and CodeQL.

It is **not ready to be described as fully finalised**. There is no current
critical software vulnerability in the evidence reviewed, but three high
priority conditions remain:

1. all 29 production vehicle rows lack insurance expiry, KTEO expiry and
   odometer data, so the implemented statutory stop-sell is inert;
2. the website and paper contract still make materially inconsistent insurance,
   age, licence-tenure and roadside-assistance statements; and
3. a clean checkout cannot complete the repository's required local verifier:
   the locked animation packages fail the webpack build, while the PGlite-heavy
   unit suite also exceeds its fixed 10-second setup timeout under full-suite
   load.

Staging is deployed and useful, but it is four commits behind `main` and four
hosted acceptance actions remain. Production may continue serving while these
items are addressed; the evidence does not support declaring the programme
complete or relying on the fleet compliance gate yet.

## Scope and method

This audit covers the repository from its first commit on **29 June 2026**
through deployed `main` commit `7741203` — **543 commits** — together with the
current production site, Vercel controls and telemetry, GitHub Actions, Sentry,
and read-only production and staging Supabase checks. It re-tests the ten areas
defined in [the audit index](README.md), applies all thirteen project principles
in [`DEFINING-STATEMENTS.md`](../../DEFINING-STATEMENTS.md), and reconciles the
results with the blueprint, contracts, insurance evidence, prior audits and
[`OPEN-ITEMS.md`](../OPEN-ITEMS.md).

No production data was changed. No migration was applied. No payment or AADE
filing was made in production. Secrets and secret values were not read.

## Priority findings

| ID | Severity | Finding and evidence | Required outcome |
|---|---|---|---|
| A01 | **High** | **Fleet compliance data is absent.** Read-only production queries found `insurance_expiry`, `kteo_expiry` and `odometer_km` null on all 29 vehicles. The stop-sell treats an unknown date as non-expired. The broker evidence says two car policies expire on 4 October and nine motorbike policies on 11 October. | Complete F1 immediately and reconcile the twelve vehicles missing from the broker's open-policy list. |
| A02 | **High** | **Customer-facing insurance and eligibility claims do not match the evidence.** The site says theft and CDW are included, promises 24-hour roadside help without qualification and uses a blanket age 21 rule. The certificates do not establish theft/CDW, the paper contract prices them as options, the 50cc has no roadside cover, the contract allows motorbikes over 18 and requires one year of licence tenure. Exclusions are not published. | Resolve B5/B6/B7 and W11–W13, then make the site, quote, counter contract and staff practice agree. |
| A03 | **High** | **The required local release verifier is not reproducible on a clean install.** `framer-motion 13.4.3` resolves locked `motion-dom 13.5.0`, whose ESM entry no longer exports `observeTimeline`; `npm run build:verify` fails under webpack. GitHub's default Next builder passed, so the branch gate did not detect the repository-owned verifier failure. Separately, two full unit runs failed in PGlite `beforeEach` hooks after 10 seconds, while all completed assertions passed and the three affected files passed 99/99 in isolation. | Restore a clean `npm run verify` pass and retain a regression check that reproduces the dependency mismatch and full-suite timing condition. |
| A04 | **High** | **Old Preview deployment snapshots are still an unresolved credential boundary.** E15 records that pre-correction Preview deployments inherited production vendor credentials. New Preview scope is fixed, but deletion of every older artifact has not been verified. | Delete the old Preview artifacts and rerun the 84 hosted checks against the replacement staging deployment. |
| A05 | **Medium** | **Staging is not signed off.** `staging` is four commits behind `main`. A positive AADE sandbox identifier, a Sentry proxy event labelled `staging`, a manual Preview cron invocation and a fresh quote-to-reservation journey remain. Existing Sentry probes arrived as `production` and `preview`, not `staging`. | Sync staging after A03 is fixed and complete the four E3 acceptance actions. |
| A06 | **Medium** | **One active production staff account has no verified MFA factor.** The proxy forces enrolment and AAL2 before application access, so this is not an observed bypass. The dormant password-bearing account still needs enrolment or removal. Supabase leaked-password protection is disabled in production and staging; Supabase documents it as a Pro-plan feature. | Enrol or deactivate the account, verify whether public signup is disabled in the dashboard, and decide whether the Pro-only password check is worth the plan change. |
| A07 | **Medium** | **Backups are running, but recovery is unproven.** Eight consecutive nightly database backups passed, decrypt and list correctly, and upload off-site. No full restore has ever been completed. Storage objects, Auth configuration and project settings are outside the archive. | Perform a non-production restore drill and design the hash-preserving Storage backup required before photo upload ships. |
| A08 | **Medium** | **The merge gate is narrower than the checks the project relies on.** Branch protection requires only `build`; hosted staging E2E and CodeQL run but are not required. The production schema-drift step skips successfully because the production Supabase Actions secrets are absent. Cancelled or absent E2E therefore does not block a merge. | Make the intended checks required and make an unavailable schema comparison report `not run` in a way that cannot satisfy the gate. |
| A09 | **Medium** | **Production/staging schema compatibility is intentionally imperfect.** Both have 29 RLS-enabled public tables and the same object counts, but six `quotes` columns differ materially in nullability/type; two functions differ in comments/formatting, and an index and policy exist on only one side. This is documented, but synthetic staging rows do not prove compatibility with historic production quote rows. | Keep the declared difference list current and add representative historical-shape compatibility fixtures. |
| A10 | **Medium** | **Monitoring delivery works, but environment separation is not yet evidenced.** Sentry received browser and server probes with privacy scrubbing, no users and no geography. The browser issue is labelled `production`; the server issue is labelled `preview`. | Produce and inspect one post-fix proxy event labelled `staging`, then retain it as acceptance evidence. |
| A11 | **Medium** | **Operational hardening has known gaps.** The enforced CSP still permits inline scripts while a stricter report-only policy is evaluated. Vercel system mitigations are active, but there are no custom firewall rules or bot protection; the database rate limiter fails open on database error. | Review CSP reports, remove the inline allowance when evidence permits, and add route-level platform controls for abuse-sensitive endpoints. |
| A12 | **Medium** | **Documentation controls are only partly followed.** Thirty-two of 55 Markdown files under `docs/` have no `Last verified:` marker, including every earlier audit. The staging runbook's opening status and later checklist disagree, and W26 remained listed as open after its backlog surface merged. | Add a freshness check, update living documents when work lands, and archive or label historical handoffs so stale instructions cannot look current. |
| A13 | **Low** | Supabase reports five unindexed foreign keys in each environment. The 17 production and 22 staging unused-index notices are not actionable without more workload history. | Index the foreign keys where their delete/join paths are used; re-evaluate unused indexes after a representative season. |

## Ten audit areas

| # | Area | Result | Evidence and limit |
|---|---|---|---|
| 1 | Mobile vs desktop | **Pass, sampled** | Live 390×844 checks on home, motorbikes, contact and quote had no horizontal overflow. Current CI browser checks pass. Real-device coverage is not current. |
| 2 | Design | **Pass, public sample** | The four public pages retain coherent hierarchy, branding, CTAs and responsive cards in light and dark themes. Fleet source photography still fails the project's own ~1600 px standard (W18). The authenticated admin was not visually re-graded. |
| 3 | Deep security | **Strong core, residual work** | All 29 public tables have RLS. Anonymous/authenticated table grants are limited to public rates/config. Four executable authenticated security-definer gateways use empty `search_path`, check `auth.uid()` and enforce staff/admin roles. Both Storage buckets are private. Webhook signatures and idempotency are tested. A06, A08 and A11 remain. |
| 4 | User-friendliness | **Partial** | Public navigation and quote lookup were inspected; automated accessibility and browser suites passed in current CI. A fresh hosted quote-to-reservation journey and a current authenticated admin workflow review remain. |
| 5 | Content and legal | **Blocker** | A02, B5–B7, N4–N6 and W11–W13 remain. No legal opinion was inferred from technical evidence. |
| 6 | Security grade | **Strong headers; no external grade claimed** | Live TLS is valid and HSTS, frame denial, MIME protection, referrer and permissions policies are present. CSP still enforces `unsafe-inline`; CAA is absent and DMARC remains `p=none` for recorded operational reasons. |
| 7 | SEO | **Automated pass; authoritative exports pending** | Current CI SEO checks pass; the live site serves indexable HTML, sitemap and robots controls. Search Console ownership is verified, but 404, Links and live URL-inspection evidence remain E8/E19. |
| 8 | Performance | **Mostly strong** | Live TTFB was 0.105–0.474 s across five public pages. Vercel Speed Insights reports desktop 100 from 69 events and mobile generally great from 146 events; `/motorbikes` is 88 from 18 mobile events and its main image visibly loaded later than the page shell. Hobby telemetry does not expose individual CWV values here. |
| 9 | Dark mode | **Pass, sampled** | Headless Chromium with an actual dark media preference loaded home, motorbikes, contact and quote at 390×844: all returned 200, used dark computed colours, had no overflow or broken images, and looked coherent. The contact page logged only reCAPTCHA's expected storage-access denial in the headless third-party context. |
| 10 | Browsers | **Partial** | Current CI passed Chromium and Firefox. WebKit was last explicitly recorded on 20 August; real Safari, Edge and Samsung Internet were not re-tested in this audit. |

## Project principles

| Principle | Assessment |
|---|---|
| §1 Photo quality | **Not met.** W18's measured fleet sources remain below the stated standard. |
| §2 Price transparency | **Not met.** The insurance/waiver evidence and “no hidden fees” promise are not yet reconciled. |
| §3 Dark mode | **Met in the sampled public paths.** |
| §4 Public/admin parity | **Mostly met by shared fields and tests; fresh hosted journey remains.** |
| §5 Shared pricing | **Met in active quote paths.** The separate dead `age_surcharge` rule remains N/W4 decision debt. |
| §6 Customer-data privacy | **Met in tested boundaries.** RLS/grants, private buckets, signed URLs and Sentry scrubbing were verified. |
| §7 Fleet-first, brokerage-compatible | **Met by the current model and blueprint.** |
| §8 Verify claims | **Improved, not complete.** Live checks and fail-first tests are common, but A03 and skipped schema drift show the gate can still overstate assurance. |
| §9 Read existing work first | **Applied by this audit.** The blueprint, defining statements, prior audits, contracts, insurance notes and open items were reconciled before testing. |
| §10 Policies/contracts are ground truth | **Not met in published content.** A02 is the result. |
| §11 Worklogs and freshness | **Partly met.** Daily logs exist; 32 documents lack freshness metadata and living checklists disagree. |
| §12 Read/open items | **Process exists, but reconciliation lagged.** W26 and staging status showed stale text. |
| §13 Operating-model approval | **Open.** N7 still lists seven live rules without sufficiently specific repository approval evidence. Absence of repository evidence does not prove no private approval occurred. |

## What has been closed since the first audit

- The anonymous function-execution and broad database-grant failures are
  closed in both live databases.
- All public tables use RLS; internal tables are not readable by anonymous or
  ordinary authenticated users.
- Roles come from protected Auth metadata, admin routes enforce server-side
  checks, and MFA/AAL2 is mandatory before application access.
- Stripe and Resend test flows, signed webhooks and idempotency passed hosted
  staging acceptance.
- The AADE HTTP-200 business-error and XML-schema defects have regression tests
  and merged fixes; the positive sandbox acknowledgement remains open.
- Sentry browser and server delivery is proven with application and project
  privacy controls.
- The production dependency audit reports zero known vulnerabilities.
- The current deployed commit passed GitHub CI, 84/84 hosted staging E2E and
  CodeQL; direct pushes, force pushes and deletion of `main` are blocked.
- Nightly encrypted database backups have eight consecutive successful runs.
- Live TLS and security headers are strong, and observed real-user performance
  is generally good.

## Verification record

**Passed now:** TypeScript; ESLint with zero errors and 24 warnings; 45-file
migration replay; affected PGlite files 99/99 in isolation; production npm
advisory audit with zero findings; current GitHub CI, CodeQL and 84/84 hosted
staging E2E; live headers/TLS/TTFB; four-page mobile dark-mode and overflow
sample; read-only production/staging grants, RLS, function, Storage, Auth and
fleet-data inspection.

**Failed now:** two full unit-suite runs because PGlite setup hooks exceeded
10 seconds (first run 4 hook failures, retry 2); clean `npm run build:verify`
because the locked `framer-motion`/`motion-dom` pair is incompatible under
webpack. Translation, static accessibility, SEO and local browser stages were
therefore not rerun after the failed exact build; the same current commit's
GitHub jobs passed their configured equivalents.

**Not run:** production payment, production AADE filing, destructive/full
restore, production migration, real-device browser matrix, fresh authenticated
admin usability review, completed live customer booking, Search Console
exports, external legal opinion, and a current dashboard check of public Auth
signup. These are not counted as passes.

## Order of work

1. Enter and reconcile fleet compliance data (F1) before the 4 and 11 October
   expiries.
2. Fix A03 so a clean checkout passes the repository-owned verifier.
3. Resolve the insurance evidence and publish one accurate set of terms (A02).
4. Remove old credential-bearing Preview artifacts (E15).
5. Bring `staging` to current `main` and finish E3's four hosted actions.
6. Close the active non-MFA staff account gap and verify the Auth dashboard
   settings.
7. Complete a restore drill and extend backup coverage before photo upload.
8. Strengthen the required merge checks, then address CSP/firewall and the
   `/motorbikes` mobile performance finding.

---

## Independent verification by the second agent — 2 October 2026, Claude

**Last verified:** 2 October 2026, Claude.

This audit was written by Codex. `DEFINING-STATEMENTS.md` §8 asks for claims to
be checked rather than accepted, so each finding below was re-tested from a
separate session with no access to Codex's environment. **Four findings are
confirmed in full, four in part, and five could not be tested here at all.** The
split is not about the findings' quality — it tracks exactly which evidence needs
a credential this session does not hold.

**The method matters more than the tally.** Where a check was possible it was run
against the live system — the production website over HTTPS, the GitHub REST API,
the repository's own source — not against this project's documents. Where it was
not possible it is recorded as **not tested**, never as agreed. W29 records the
read-only access that would close the gap.

### Confirmed in full

| # | What was checked, and how |
|---|---|
| **A02** | **Every limb confirmed verbatim** from `https://anadyon.gr/terms` fetched live. §6 reads *"All our rentals include: Third party insurance / Theft insurance / Collision Damage Waiver (CDW)"*. §10 reads *"We provide free 24-hour roadside assistance"* — unqualified. §2 reads *"Minimum driver's age is 21 years"*, with the 21–22 surcharge disclosed but **no motorbike-at-18 provision and no licence-tenure rule**, where the counter contract art. 6.1(a) requires a licence held one year. The words *exclusion* and *excess* **do not appear on the page at all**. One detail the audit did not name sharpens it: the page does carry one carve-out — *"Bicycles are not covered by the above"* — which makes the absence of a 50cc roadside carve-out a choice rather than an oversight. |
| **A03** | **Reproduced and fixed, both halves.** The webpack failure reproduced exactly: `motion-dom@13.5.0` has no `observeTimeline` at all, not relocated. Fixed in #195 by pinning *forward* to 13.5.1, which restores the export, rather than back to 13.4.2 — with `lib/animationDependencyPairing.test.ts` asserting every symbol `framer-motion` imports is exported. The PGlite half reproduced on demand at `--maxWorkers=14`: one boot costs 1.9s, fourteen concurrent 21.3s on four cores, so the 10s default hook budget is crossed at about seven simultaneous boots. Fixed in #197. **The audit was right and I had been wrong** — earlier the same day I called the PGlite half "not a defect". |
| **A08** | **Confirmed without needing any new access**, which corrected my own earlier claim that it was unverifiable. `/branches/main/protection` is 403 to an agent session, but `GET /repos/anadyongr-droid/anadyon/branches/main` is 200 and carries the summary: `protected: true`, `required_status_checks.contexts: ["build"]`, `enforcement_level: "everyone"`, `app_id 15368`. `/rulesets` and `/rules/branches/main` are both `[]`, so nothing adds to it. **Required approving reviews are empirically zero** — #195 merged on 2 October with no approval and GitHub did not object. One nuance on the second limb: the schema-drift step does `exit 0`, but it emits a GitHub `::warning` titled *"Schema drift check skipped"*, and `ci.yml` documents that as deliberate because the secrets are opt-in to limit what a compromised Actions run could reach. So it reports "not run" loudly; it just does not fail. The remediation stands, but the step is not silent. |
| **A12** | **Confirmed and still current: 32 of 56** Markdown files under `docs/` carry no `Last verified:` marker. The audit said 32 of 55; the count is unchanged and the denominator grew by one. |

### Confirmed in part

| # | Confirmed here | Still not tested |
|---|---|---|
| **A05** | **The staging-lag limb is now stale.** `origin/staging` and `origin/main` are the same commit, `6276d32` — zero behind, not four. | The AADE sandbox identifier, the `staging`-labelled Sentry event, the Preview cron invocation and the fresh quote-to-reservation journey. |
| **A06** | **The mechanism, in code.** `proxy.ts` 441–478 redirects to `/admin/setup-mfa` when no TOTP factor is enrolled, and forces in-session AAL2 when `nextLevel === "aal2"` and `currentLevel !== "aal2"`. The audit's "not an observed bypass" is correct. | Which accounts actually have a verified factor, whether public signup is disabled, and the leaked-password setting — all dashboard or database state. |
| **A07** | **The run history, and the audit undercounts it.** `actions/workflows/338206206/runs` shows **eleven consecutive scheduled successes**, #43 on 22 September through #53 on 2 October, plus a dispatched success #42; the last failures are #39–#41 on 21 September, which matches E16. And **"no full restore has ever been completed" is confirmed by reading `backup.yml`**, not merely by absent evidence: its only verification step is *"Verify the archive decrypts"* piping into `tar -tzf - > /dev/null`, which lists an archive and never loads it into a database. | Whether a restore would in fact succeed, and the Storage/Auth/settings coverage gap. |
| **A11** | **Both code limbs.** The enforced CSP and the report-only policy are identical except that report-only drops `'unsafe-inline'`. And `lib/rateLimit.ts` fails open in both paths — line 68–70 returns `{ ok: true }` on a Supabase RPC error, line 97–99 on a throw, each logging first. Its own header states this is deliberate: *"A limiter that rejects every request when [the database is down] … is a worse failure than the abuse it [prevents]."* Both the exposure and the reasoning are real. | Vercel firewall rules and bot protection. |

### Not tested here

**A01, A04, A09, A10 and A13** each need a credential this session does not hold:
the production database (A01, A09, A13), the Vercel project (A04) and Sentry
(A10). They are recorded as **not tested**, which is not the same as doubted —
A01 in particular is the most urgent item on the list and nothing here disputes
it. W29 has the read-only access that would let a second agent check them.

### One error this audit inherited, and it was mine

**A01's evidence line says "nine motorbike policies on 11 October", and its
remediation says "the twelve vehicles missing from the broker's open-policy
list". Both figures are wrong, and they came from this project's own insurance
document, not from the audit's own work.** §1a of
`INSURANCE-COVER-AND-RESTRICTIONS.md` had prose saying nine, seventeen and twelve
beside a table listing **eight** plates on 11 October and **sixteen** distinct
plates of twenty-nine — so the unexplained remainder is **thirteen**, one more
vehicle on unestablished cover than stated. I wrote both the table and the prose
on 30 September and never recounted one against the other, and both errors ran in
the direction that flattered the fleet.

Corrected in that document and in `OPEN-ITEMS.md` on 2 October, with
`lib/insuranceFleetCounts.test.ts` now counting the table and holding the prose to
it. **The audit was not wrong to trust the document**; the document was wrong.
That is the §9 failure mode in its exact shape — a figure that propagates by
being read rather than recounted — and it is the reason this verification pass
checked the live system instead of the repository wherever it could.
