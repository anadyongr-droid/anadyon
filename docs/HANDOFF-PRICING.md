# Codex handoff — seasonal-boundary pricing

Status date: 2026-08-21

## Safety and repository state

- Worktree: `work/anadyon-pricing`
- Branch: `codex/pricing-season-boundaries`
- Base: `origin/main` at `5cca6ec`
- This is deliberately separate from H1 branch `codex/h1-atomic-booking` and draft PR #2.
- Nothing in this branch has been committed, pushed, merged, or deployed yet.
- No migration is involved and no production data or configuration has been changed.
- Do not work in the older dirty/detached checkouts. Continue only in this worktree.

## Confirmed business rule

The whole rental selects one duration tier (1–2, 3–6, or 7+ days). Each
successive billable 24-hour period then uses the seasonal rate for the calendar
date on which that billing period starts.

Confirmed example:

- Car B, 2026-08-25 09:00 to 2026-09-01 09:01
- Eight billable days, so the whole rental uses the 7+ tier
- Seven August days at €50.40 = €352.80
- One September day at €21.40 = €21.40
- Expected vehicle subtotal: **€374.20**

## Reproduced defect

Before the current local edit, `calcVehicleSegments` walked only the date span
and then added any time-created extra day to the last existing segment. In the
confirmed example that produced one eight-day August segment and **€403.20**.

The new regression suite initially produced eight failures:

- Confirmed €374.20 case failed as €403.20.
- Five other seasonally priced vehicle groups failed at the same boundary.
- The full-year independent-reference matrix failed.
- The timezone-invariance check failed because it still observed the wrong
  seasonal allocation.

## Current uncommitted implementation

### `lib/pricing.ts`

- Parses date-only inputs with validated UTC calendar arithmetic.
- Allocates every billable day from the pickup date, instead of appending a
  shortfall to the preceding month.
- Uses the whole-rental duration tier for every segment.
- Keeps seasonal allocation independent of browser/server timezone.
- Makes `calcRentalDays` use timezone-independent wall-clock arithmetic so
  Vercel and a Greece-based browser do not disagree around daylight-saving
  changes.
- Adds `resolveVehiclePricing`, which keeps an exact segmented subtotal while
  storing/displaying the existing weighted-average daily-rate summary. It does
  not multiply the rounded average back into the charge.

### `app/admin/components/ReservationModal.tsx`

- Replaces pickup-month-only admin pricing with the same shared segmented
  calculation used by the public booking form and quote API.
- Preserves the flat per-day staff override behaviour.
- Shows a seasonal breakdown for multi-season rentals and measures an override
  against the exact card subtotal.

### Tests

- New: `lib/pricingSeasonBoundaries.test.ts`
  - Exact €374.20 regression.
  - All six pricing groups.
  - Original same-month partial-day regression.
  - Every pickup date in 2026 × nine duration/tier cases × all six groups,
    checked against an independent per-day reference.
  - Multiple runtime timezones.
- Extended: `lib/rentalDays.test.ts`
  - Greek spring/autumn clock-change boundaries.
  - Browser/server timezone invariance.
- Extended: `lib/rateOverride.test.ts`
  - Exact cross-season subtotal despite a rounded weighted average.
  - Flat staff rate override and reset semantics.

## Verification already completed

- Focused pricing/rental/override tests: **30 passed, 0 failed**.
- TypeScript: `npx tsc --noEmit` passed.
- ESLint on touched files: **0 errors**; four warnings already present in
  `ReservationModal.tsx` outside this change.
- `git diff --check` passed.
- `npm ci` reported zero dependency vulnerabilities.

## Final local verification — 2026-08-21

- `npm test`: **194 passed, 0 failed**.
- `npx tsc --noEmit`: passed.
- `npm run lint`: **0 errors** and 21 existing warnings; none were introduced
  by this change.
- Production build: passed with non-secret placeholder Supabase/Resend values.
  It compiled, type-checked, and generated all 88 static pages. A build with no
  variables at all correctly refuses to start, which prevents a false local
  success with an unconfigured backend.
- `npm run check:translation`: 14/14 Greek pages checked, no problems.
- `npm run check:a11y`: 28 static pages clean, with zero axe violations.
- `npm run test:seo`: **60 passed**.
- Chromium responsive suite: **12 passed, 2 skipped**. The skipped price-card
  assertions require a live rate card, intentionally unavailable to the
  placeholder build.
- Firefox + WebKit responsive suite: **24 passed, 4 skipped** for the same
  live-rate-card reason. It covered English and Greek at 320, 360, 375, 390,
  430 and 768px.
- `git diff --check`: passed.

## CI follow-up

- The first draft-PR CI run found no assertion failure, but GitHub's shared
  runner took 5.7 seconds through the intentionally exhaustive
  365 × 9 × 6 pricing matrix and hit Vitest's generic five-second per-test
  limit. The matrix now has a documented 15-second limit; the full local suite
  remains 194/194 after that adjustment. Await the rerun before considering
  the PR green.

## Verification intentionally deferred to CI / authorised environment

- `npm run check:schema` requires `SUPABASE_SERVICE_ROLE_KEY` to read the live
  schema. It correctly stops without that credential; no key was copied into
  this worktree.
- `npm run test:e2e` reads `.env.local` and talks to the real Supabase project.
  It correctly stops when that file is absent; no production rows or emails
  were created locally.
- The draft PR's CI must run the checks supplied with its authorised secrets.
  Do not claim schema or live end-to-end verification passed until those checks
  are green.

## Remaining release steps

1. Stage only the explicitly reviewed files; do not use `git add .` or
   `git add -A`.
2. Commit and push `codex/pricing-season-boundaries`, then open a **separate
   draft PR** to `main`. Do not add these changes to H1 PR #2.
3. Verify the draft PR's GitHub Actions and Vercel preview, including its
   authorised schema and end-to-end checks.
4. Do not merge or deploy without Tasos's explicit decision.

## Commands to resume

```bash
cd /Users/macminitasos/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an-2/work/anadyon-pricing
git status --short --branch
git diff --check
git diff -- app/admin/components/ReservationModal.tsx lib/pricing.ts lib/pricingSeasonBoundaries.test.ts lib/rentalDays.test.ts lib/rateOverride.test.ts
```

Read `docs/HANDOFF-H1.md` only for the independent H1 deployment gate. Never
apply its migration automatically.
