# Audits

Full-system reviews of anadyon.gr, kept here so each one can be read against the
last instead of restating it.

Until 25 August 2026 these lived only in a Codex working folder outside version
control — three documents, 77 KB, no history and no backup, in a directory that
had already lost files. They are committed now for that reason.

| Date | Document | Verdict at the time |
|---|---|---|
| 18 Aug 2026 | [Pre-launch audit](2026-08-18-prelaunch.md) | Blockers in security, content/legal, security grade |
| 19 Aug 2026 | [Post-launch audit](2026-08-19-post-launch.md) | Live, with findings to fix |
| 19 Aug 2026 | [Optimisation & security review](2026-08-19-optimisation-security.md) | High and medium findings, performance plan |

Architecture and competitor benchmarking live separately, in
[`../RENTAL-SYSTEM-BLUEPRINT.md`](../RENTAL-SYSTEM-BLUEPRINT.md). An audit asks
*is what we built sound?*; the blueprint asks *are we building the right
thing?*. Keep them apart.

---

## The ten review areas

Every audit is scored against these. They come from the pre-launch audit's
"Review by requested area" table and are recorded here because until now they
existed only inside that one uncommitted file — the criteria the project is
graded on should not be harder to find than the grades.

| # | Area | What it covers |
|---|---|---|
| 1 | Mobile vs desktop | Responsive layout, horizontal overflow, touch targets at 375 px |
| 2 | Design | Branding coherence, hierarchy, imagery consistency, CTA clarity |
| 3 | Deep security | Auth, MFA, RLS, database grants, webhooks, rate limiting |
| 4 | User-friendliness | Booking journey, admin workflows, error recovery, accessibility |
| 5 | Content & legal | Age rules, privacy policy, terms, contract disclosures, pricing consistency |
| 6 | Security grade | Headers, CSP, transport, what an external grader would score |
| 7 | SEO | Canonicals, hreflang, sitemap, structured data, indexability |
| 8 | Performance | TTFB, page weight, Core Web Vitals, image delivery |
| 9 | Dark mode | Theme support, contrast in both themes, colour-scheme handling |
| 10 | Browsers | Chromium, Firefox, WebKit; real devices; Edge and Samsung Internet |

---

## Scoring an area honestly

An area gets a grade only when something was actually run against it. If it was
not tested, it is marked **not re-tested** — never given a grade inferred from
adjacent work going well.

This is not pedantry. The 25 August re-audit initially graded
user-friendliness on the strength of a single fix, which is not what the area
measures, and it nearly reported ten dark-mode contrast failures that did not
exist. Both are recorded in the project's measurement notes.

Two traps specific to auditing this site, both of which have produced confident
false readings:

- **`grep -c` counts matching lines, not occurrences**, and React emits
  `hrefLang` camel-cased. Together they report zero hreflang tags on a site that
  has seven. Use `grep -oi … | wc -l`.
- **Tailwind v4 emits `lab()` and `oklch()`.** Parsing those strings as RGB
  gives nonsense contrast. Paint the colour to a 1×1 canvas and read the pixel
  back — and reset `fillStyle` to a sentinel before each sample, or an
  unsupported colour silently inherits the previous one. Verify the method
  returns exactly 21:1 for white on black before trusting any result.

Paint metrics cannot be measured from a hidden browser pane; browsers defer
painting for hidden tabs. For Core Web Vitals use field data — Vercel Speed
Insights, or PageSpeed Insights with an API key — not a lab tool in an
automation context.

---

## When to run one

- Before any launch or major release
- After an incident
- Quarterly while the system is under active development

Write the result here as `YYYY-MM-DD-<scope>.md`, add a row to the table above,
and state plainly which of the ten areas the audit did **not** cover.
