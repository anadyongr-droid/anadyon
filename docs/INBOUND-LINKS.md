# Inbound links, broken URLs and the 404 page

**Last verified: 19 September 2026**
Owner: agents, except where it says Tasos.

## Why this document exists

On 19 September 2026 a referral appeared in Google Analytics from
[notrevieenvoyage.com](https://notrevieenvoyage.com/que-faire-a-zakynthos-dans-les-iles-ioniennes/),
a French travel guide to Zakynthos. It links `https://anadyon.gr/en/`.

That URL is not a route on the current site. English is at the root and Greek
under `/el`, so `/en/` 308s to `/en` (trailing-slash normalisation) and then
404s — onto Next's built-in error page, which is a full screen of white with
"404 This page could not be found." in the system font.

Every reader that guide sent us arrived at that. We do not know how many;
nothing recorded it. It was found by accident, from one line in a referral
report, roughly a year after launch.

The link cannot be edited — it is on somebody else's website. That is what makes
this different from an ordinary broken link, and it is why the fix has to be a
redirect rather than a correction.

**It was not one link.** `/en/` *had* been a real page — on the WordPress site
this one replaced — and checking the archive turned one dead URL into 86. The
detail is in "The old site" below; the short version is that the whole previous
URL structure was retired without redirects, and the French guide was simply the
first person to notice out loud.

## What was changed

| Change | Where | What it does |
|---|---|---|
| 46 permanent (308) redirects covering the old site's URLs | `lib/legacyRedirects.ts`, wired in `next.config.ts` | `/en/...` plus the whole 2014–2025 WordPress structure — fleet pages, information pages, both booking-funnel steps, in both languages — now land on the live equivalent, and eleven years of link equity transfers instead of draining into a 404. |
| A recovery page replacing the blank 404 | `app/not-found.tsx`, `app/components/NotFoundContent.tsx` | Fleet links, contact, rental lookup, in the visitor's language. Still served with a 404 status. |
| A `page_not_found` event carrying the path and referrer | `NotFoundContent.tsx` | Turns the next wrong link from something we stumble on into something reported. Consenting visitors only — see the blind spot below. |
| A register of URLs other people publish at us | `docs/inbound-links.json` | So a URL a stranger already published can never silently break again. |
| `npm run check:links` | `scripts/check-links.mjs` | Checks the register and crawls our own pages for internal breakage. |
| Eight regression tests | `tests/browser/inbound-links.spec.ts` | Five failed against the unfixed build. One guards the 404 *status*, which already worked. Two walk all 46 legacy rules and assert each lands on the page it claims. |

### The old site: confirmed, and far bigger than one link

Tasos authorised access to `web.archive.org` on 19 September. The guess was
right, and it was far too small.

The Wayback CDX index returns **354 archived URLs** for this domain, the earliest
from **15 June 2014**. Of the **182 distinct paths that once returned 200**,
**86 return 404 on the live site today**. Nothing redirected when the site was
replaced.

The old site was WordPress — the index is full of `/wp-content/plugins/...` —
bilingual with `/en/` and `/el/` prefixes, and it used long keyword slugs at the
root for both languages:

| Old | Now |
|---|---|
| `/rent-cars-zakynthos`, and five car pages beneath it | `/cars` |
| `/rent-motorbikes-zakynthos`, and five scooter pages | `/motorbikes` |
| `/rent-bikes-zakynthos`, and two bicycle pages | `/bikes` |
| `/enoikiaseis-autokinita-zakynthos/...` and the Greek fleet slugs | `/el/cars` etc. |
| `/about-anadyon-vehicle-rentals-zakynthos-company-profile` | `/about` |
| `/vehicle-pricing-extras`, `/submit-request-bikes` | `/quote` |
| `/kratisi-ochimatos-times-ekstra`, `/ypovoli-aitimatos-bikes` | `/el/quote` |
| a `/zante-rentals/` prefix carrying a second copy of the fleet pages | as above |

Those were the money pages, and they had eleven years to accumulate links.

**46 redirect rules** now cover them, in `lib/legacyRedirects.ts`, all permanent
(308). Every destination was established by reading the archived page's
`<title>` at a real snapshot, not by parsing the slug: `/vehicle-pricing-extras`
turns out to be "Vehicle Rental Reservation Request - Pricing & Extras", and
`/kratisi-ochimatos-times-ekstra` its Greek twin. Slugs read plausibly and mean
something else often enough to be worth the extra requests.

A browser test walks all 46 against a running server and asserts each lands on
the page it claims — a rule pointing at a page that does not exist replaces a
404 with a different 404 while looking, in review, exactly like a fix.

#### How to redo this

```
curl "https://web.archive.org/cdx/search/cdx?url=anadyon.gr&matchType=domain&output=text&fl=original,timestamp,statuscode&collapse=urlkey&limit=2000"
```

HTTPS, not HTTP — the egress proxy only carries HTTPS, and a plain-`http://`
call to the same endpoint returns "Blocked by egress policy", which reads like a
domain block and is not one. That cost an hour on 19 September.

Then `https://web.archive.org/web/<timestamp>id_/<url>` fetches a snapshot
unmodified (`id_` suppresses the archive's own toolbar injection).

#### Probing production in bulk trips Vercel's firewall

Checking all 181 archived paths against `https://anadyon.gr` twice got this
session firewalled: every request afterwards returned **403 from a Vercel
challenge page**, `server: Vercel`, regardless of user agent. It decays on its
own after a while.

Two consequences, both already handled:

- `check-links.mjs` treats 401/403/407/429 as **"could not check"**, reported
  separately and never counted as a broken link. A checker that reports the
  whole site dead because it annoyed the firewall is worse than no checker.
- Its default concurrency is 3, and `--concurrency` lowers it further.

If a bulk sweep is genuinely needed, run it against a local `next start` and
keep production for spot checks.

#### One old page was deliberately not redirected

`/επανεκ-2014-2020` — archived title "ΕΠΑνΕΚ 2014-2020", the EU Operational
Programme co-funding publicity page, live until at least October 2022 and now
gone entirely. It is not a marketing page: businesses taking ΕΣΠΑ/ΕΠΑνΕΚ money
carry a publicity obligation, and whether it still binds depends on the grant's
own terms. Redirecting it to the home page would quietly dispose of a possible
legal duty, so it is left 404ing and raised as open item **L1** instead.

## The honest answer to "check all our backlinks"

Two different questions hide inside that one, and only one of them is hard.

**"Which of our URLs are dead?" is answerable, and now answered.** The Wayback
Machine holds the complete history of what this domain served, so the full list
of retired URLs can be recovered without anyone's permission or any referral
luck. That is where the 86 came from, and it is repeatable — the command is
above.

**"Who links to us?" is not answerable from our own server, and no script we
write will change that.** Backlinks live on other people's machines. Nothing our
website can do will enumerate the pages pointing at it; a request only arrives
if somebody follows one.

The distinction matters because the first question covers most of the damage.
A dead URL is dead for every link to it, known or not — so redirecting all 86
fixes every inbound link to any of them, including the ones we will never see.
The external indexes below are for the remainder: links to URLs that were never
ours to begin with (a typo, a truncation, a guessed path), and for measuring
what the redirects recovered.

What exists is four external indexes. Three are free.

| Source | Gives | Cost | Needs |
|---|---|---|---|
| **Google Search Console** | *Indexing → Pages → Not found (404)*, and the Links report. **Both are samples, not inventories** — see the limits below. | Free | Verified ownership |
| **Bing Webmaster Tools** | Backlinks report; can import the GSC site verification | Free | Verified ownership |
| **Ahrefs Free** (was Ahrefs Webmaster Tools) | Site Explorer: "Uncover which websites and pages are linking to you", plus broken-link data for internal and external links | Free, unlimited verified sites; **up to 1,000 backlinks visible at once** | Verified ownership |
| Semrush / Majestic / Ahrefs paid | Larger indexes, competitor backlinks | Paid — Ahrefs' own next tier is $29/mo | Money, so Tasos |

Ahrefs' figures are from its own page, read 19 September 2026. Its comparison
table claims Search Console shows only the "Top 1,000" links while Ahrefs Free
shows "All known links", but its own limits table and FAQ both say 1,000
visible at once, so treat 1,000 as the working ceiling for the free tier.

### What Search Console does not give you

Checked against Google's own documentation, 19 September 2026, because the
earlier draft of this document overstated it:

- **The 404 report is a one-month window, not a history.** Google: *"To avoid
  showing you an eternally growing list of 404 errors, the Page indexing report
  shows only URLs that have shown 404 errors in the past month."* It will not
  produce eleven years of dead URLs. The Wayback Machine did that, and is the
  reason this was solvable at all.
- **The Links report is a sample.** Google: *"This report isn't a comprehensive
  list of every link on your site. It shows a sample of internal and external
  links"*, and *"Tables are limited to 1,000 rows"*.
- **Timing works against us now.** The 46 redirects shipped on 19 September, so
  as Google re-crawls, those URLs stop being 404s and drop out of the report.
  Pulling the export sooner shows more. This is not a reason to rush — the
  redirects are the fix, and the report is only how we find what they missed.

None of that makes it not worth doing. It makes it a **discovery feed for what
is still breaking**, rather than the audit the earlier draft implied.

### Is Search Console even connected?

**Not established.** The 2026-08-18 and 2026-08-19 audits both recommended
connecting Search Console and Bing, and the prelaunch checklist lists
"Search Console/Bing ownership … verified" as an item, but nothing records it
being done.

Checked directly on 19 September 2026: `anadyon.gr` serves no
`google-site-verification` meta tag, and its only DNS TXT record is the SPF
one. That rules out two of the verification methods but not the other two —
verification through the Google Analytics property or an uploaded HTML file
would leave no trace either place, and Analytics *is* live (`G-00X72SCDNW`).

So it may well be connected. Somebody has to open the console and look.

## What needs Tasos, and why only this

Verifying ownership of a domain in Search Console, Bing or Ahrefs is a browser
session with a login and a second factor. That is on the short list in
`AGENTS.md` of things an agent physically cannot do — not a decision being
referred upward.

1. **Confirm whether `anadyon.gr` is verified in Google Search Console.** If it
   is not, verify it (the Analytics method will work, since GA is already on the
   site and under the same Google account).
2. **Export *Pages → Not found (404)*.** This is the payload. It lists dead URLs
   *and* the pages linking to them — the complete version of the accident that
   started this.
3. **Export the Links report** — External links → Top linking sites, and Top linked pages. A sample capped at 1,000 rows, so read it as "who links to us most", not "everyone who links to us".
4. Optionally, sign up for Bing Webmaster Tools and Ahrefs Free and verify the
   same domain.

Send the exports over, or drop the CSVs in `docs/`. Everything after that is an
agent job: each broken URL gets a redirect if it has a sensible destination, and
an entry in `docs/inbound-links.json` either way, so it is asserted from then on.

## The routine

**On any Analytics referral from a site we do not recognise** — follow the link
yourself. That is all it would have taken here.

**When a Search Console 404 export arrives** — for each dead URL with a
referring page: add a redirect if there is an obvious destination, add it to
`docs/inbound-links.json`, run `npm run check:links`.

**Before merging anything that moves or renames a public route** —
`npm run check:links` against the local build. A moved route with no redirect is
the same defect as `/en`, created deliberately.

**Monthly** — `npm run check:links -- --base https://anadyon.gr` against
production, and re-read the 404 export.

```
npm run check:links                                  # local build, both passes
npm run check:links -- --inbound-only                # no server needed
npm run check:links -- --base https://anadyon.gr     # production
```

## Blind spots, stated plainly

- **The `page_not_found` event does not fire for crawlers, and does not fire for
  any visitor who declined analytics cookies.** Google Analytics loads only on
  full consent. Search engines are the population that matters most for finding
  stale inbound links, and they are precisely the population it cannot see. It
  supplements Search Console; it does not replace it.
- **`check-links.mjs` checks the URLs we know about.** Its inbound pass is only
  ever as complete as `docs/inbound-links.json`, which is hand-maintained. It is
  a regression guard, not a discovery tool.
- **The internal crawl starts from `sitemap.xml`.** A page reachable only by a
  link and absent from the sitemap is not crawled.
- **Nothing here measures whether a recovered visitor goes on to book.** The 404
  page is built on the assumption that fleet links beat a blank page, which is
  not a controversial assumption, but it is not measured either.

## Related

- `docs/audits/2026-08-18-prelaunch.md` and `docs/audits/2026-08-19-post-launch.md`
  — both recommended Search Console and Bing; neither was closed out.
- `next.config.ts` — the canonical-host redirects that this sits beside.
