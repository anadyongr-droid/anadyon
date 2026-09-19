# Inbound links, broken URLs and the 404 page

**Last verified: 19 September 2026**
Owner: agents, except where it says Tasos.

## Why this document exists

On 19 September 2026 a referral appeared in Google Analytics from
[notrevieenvoyage.com](https://notrevieenvoyage.com/que-faire-a-zakynthos-dans-les-iles-ioniennes/),
a French travel guide to Zakynthos. It links `https://anadyon.gr/en/`.

That URL has never existed on this site. English is at the root and Greek under
`/el`, so `/en/` 308s to `/en` (trailing-slash normalisation) and then 404s —
onto Next's built-in error page, which is a full screen of white with "404 This
page could not be found." in the system font.

Every reader that guide sent us arrived at that. We do not know how many;
nothing recorded it. It was found by accident, from one line in a referral
report, roughly a year after launch.

The link cannot be edited — it is on somebody else's website. That is the whole
problem in one sentence, and it is what makes this different from an ordinary
broken link.

## What was changed

| Change | Where | What it does |
|---|---|---|
| `/en` and `/en/:path*` → `/:path*`, permanent (308) | `next.config.ts` | The referred URL and anything under it now land on the real English page, and the accumulated link equity transfers instead of draining into a 404. |
| A recovery page replacing the blank 404 | `app/not-found.tsx`, `app/components/NotFoundContent.tsx` | Fleet links, contact, rental lookup, in the visitor's language. Still served with a 404 status. |
| A `page_not_found` event carrying the path and referrer | `NotFoundContent.tsx` | Turns the next wrong link from something we stumble on into something reported. Consenting visitors only — see the blind spot below. |
| A register of URLs other people publish at us | `docs/inbound-links.json` | So a URL a stranger already published can never silently break again. |
| `npm run check:links` | `scripts/check-links.mjs` | Checks the register and crawls our own pages for internal breakage. |
| Six regression tests | `tests/browser/inbound-links.spec.ts` | Five failed against the unfixed build. The sixth guards the 404 *status*, which already worked. |

### Why `/en/` was written that way is not established

The obvious guess is that the pre-2026 site served English under `/en/` — the
footer says "Copyright © 2014–2026", so there was an earlier site. **This was
not verified.** `web.archive.org` is blocked by this environment's egress
policy, and no other primary source for the old URL structure was reachable.

It stays a guess, recorded so nobody later reads it as a finding. What is
verified is only that the URL is linked from outside and that it was dead.

If the guess is right, more of the old structure is linked too and only the
sources below will show it.

## The honest answer to "check all our backlinks"

**A complete check is not possible from our own server, and no script we write
will change that.** Backlinks live on other people's machines. Nothing our
website can do will enumerate the pages that link to it; the request only
arrives if somebody follows one.

What exists is four external indexes. Three are free.

| Source | Gives | Cost | Needs |
|---|---|---|---|
| **Google Search Console** | Links report; and *Pages → Not found (404)* with referring pages — the one that directly answers "which inbound links are broken" | Free | Verified ownership |
| **Bing Webmaster Tools** | Backlinks report; can import the GSC site verification | Free | Verified ownership |
| **Ahrefs Free** (was Ahrefs Webmaster Tools) | Site Explorer: "Uncover which websites and pages are linking to you", plus broken-link data for internal and external links | Free, unlimited verified sites; **up to 1,000 backlinks visible at once** | Verified ownership |
| Semrush / Majestic / Ahrefs paid | Larger indexes, competitor backlinks | Paid — Ahrefs' own next tier is $29/mo | Money, so Tasos |

Ahrefs' figures are from its own page, read 19 September 2026. Its comparison
table claims Search Console shows only the "Top 1,000" links while Ahrefs Free
shows "All known links", but its own limits table and FAQ both say 1,000
visible at once, so treat 1,000 as the working ceiling for the free tier.

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
3. **Export the Links report** (top linking sites and top linked pages).
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
