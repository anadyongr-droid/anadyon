/**
 * The 2014–2025 WordPress site's URL structure, mapped onto this one.
 *
 * ## Why this exists
 *
 * On 19 September 2026 a Google Analytics referral showed a French travel guide
 * linking `https://anadyon.gr/en/`, which 404ed. The guess at the time was that
 * the old site had served English there. The guess was recorded as a guess
 * because web.archive.org was blocked.
 *
 * Tasos then authorised access to the archive, and the guess turned out to be
 * right — and far too small. The Wayback CDX index returns 354 archived URLs for
 * this domain going back to 15 June 2014. Of the 182 distinct paths that once
 * returned 200, **86 return 404 on the live site today**, including every one of
 * the old fleet pages.
 *
 * The old site was WordPress (the index is full of `/wp-content/...`), bilingual
 * with `/en/` and `/el/` prefixes, and used long keyword slugs at the root for
 * both languages. Nothing redirected when it was replaced. Every inbound link
 * accumulated over eleven years against those URLs has been dead since launch.
 *
 * ## How the destinations were decided
 *
 * By reading the archived pages, not by parsing the slugs. Each mapping below
 * was confirmed against the `<title>` of a real snapshot at a real timestamp —
 * `/vehicle-pricing-extras` is "Vehicle Rental Reservation Request - Pricing &
 * Extras", `/kratisi-ochimatos-times-ekstra` is its Greek twin "Αίτημα Κράτησης
 * Οχήματος - Τιμές και Έξτρα", and so on. Slugs read plausibly and mean
 * something else often enough to be worth the extra requests.
 *
 * ## Rules
 *
 * All permanent (308). These URLs are never coming back, and a 308 is what
 * transfers eleven years of accumulated link equity to the live page instead of
 * letting it drain into a 404.
 *
 * Destinations are the nearest *live* page, never a guess at a page we do not
 * have. Five individual car pages collapse onto `/cars` because there is no
 * per-vehicle page to send them to; sending them somewhere real beats sending
 * them nowhere. Where the old page has no successor at all, it is left to 404
 * onto the recovery page rather than redirected somewhere misleading.
 */

export interface LegacyRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const r = (source: string, destination: string): LegacyRedirect => ({
  source,
  destination,
  permanent: true,
});

export const legacyRedirects: LegacyRedirect[] = [
  // ── The language prefixes ──
  // `/en` is the one with direct evidence of an inbound link; `/el` is the same
  // shape and was equally live on the old site, but it collides with the real
  // Greek routes, so only the bare prefix is handled and `/el/...` is left alone.
  r("/en", "/"),
  r("/en/:path*", "/:path*"),

  // ── English fleet pages, and the per-vehicle pages beneath them ──
  r("/rent-cars-zakynthos", "/cars"),
  r("/rent-cars-zakynthos/:path*", "/cars"),
  r("/rent-motorbikes-zakynthos", "/motorbikes"),
  r("/rent-motorbikes-zakynthos/:path*", "/motorbikes"),
  r("/rent-bikes-zakynthos", "/bikes"),
  r("/rent-bikes-zakynthos/:path*", "/bikes"),

  // WordPress category archives for the same three.
  r("/category/rent-cars-zakynthos", "/cars"),
  r("/category/rent-motorbikes-zakynthos", "/motorbikes"),
  r("/category/rent-bikes-zakynthos", "/bikes"),

  // ── Greek fleet pages ──
  r("/enoikiaseis-autokinita-zakynthos", "/el/cars"),
  r("/enoikiaseis-autokinita-zakynthos/:path*", "/el/cars"),
  r("/enoikiaseis-michanes-zakynthos", "/el/motorbikes"),
  r("/enoikiaseis-michanes-zakynthos/:path*", "/el/motorbikes"),
  r("/enoikiaseis-podilata-zakynthos", "/el/bikes"),
  r("/enoikiaseis-podilata-zakynthos/:path*", "/el/bikes"),

  // ── English information pages ──
  r("/about-anadyon-vehicle-rentals-zakynthos-company-profile", "/about"),
  r("/anadyon-vehicle-rentals-explore-zakynthos-sights", "/sights"),
  r("/anadyon-vehicle-rentals-zakynthos-faq", "/faq"),
  r("/anadyon-vehicle-rentals-zakynthos-reservations-terms-conditions", "/terms"),
  r("/anadyon-vehicle-rentals-zakynthos-terms-of-use", "/terms-of-use"),
  r("/anadyon-vehicle-rentals-zakynthos-sitemap", "/sitemap"),
  r("/contact-anadyon-vehicle-rentals-zakynthos", "/contact"),
  r("/contact-details", "/contact"),

  // The newsletter sign-up has no successor; contact is the nearest live page
  // that does something for someone who wanted to hear from us.
  r("/anadyon-vehicle-rentals-zakynthos-newsletter-subscribe", "/contact"),

  // ── Greek information pages ──
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-etairiko-profil", "/el/about"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-aksiotheata", "/el/sights"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-erotiseis", "/el/faq"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-oroi-proypotheseis", "/el/terms"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-oroi-chrisis", "/el/terms-of-use"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-epikoinonia", "/el/contact"),
  r("/anadyon-enoikiaseis-ochimaton-zakynthos-sitemap", "/el/sitemap"),

  // ── The old booking funnel, which was two pages per language ──
  // Titles confirm these are the pricing/extras step and the confirm/submit
  // step of one reservation request. `/quote` is today's equivalent.
  r("/vehicle-pricing-extras", "/quote"),
  r("/submit-request-bikes", "/quote"),
  r("/kratisi-ochimatos-times-ekstra", "/el/quote"),
  r("/ypovoli-aitimatos-bikes", "/el/quote"),

  // ── The `/zante-rentals/` prefix ──
  // A second address for the same pages on the old site.
  r("/zante-rentals/rent-cars-zakynthos", "/cars"),
  r("/zante-rentals/rent-motorbikes-zakynthos", "/motorbikes"),
  r("/zante-rentals/rent-bikes-zakynthos", "/bikes"),
  r("/zante-rentals/enoikiaseis-autokinita-zakynthos", "/el/cars"),
  r("/zante-rentals/enoikiaseis-michanes-zakynthos", "/el/motorbikes"),
  r("/zante-rentals/enoikiaseis-podilata-zakynthos", "/el/bikes"),
  r("/zante-rentals/blog", "/blog"),
  r("/zante-rentals/istologio", "/el/blog"),

  // ── The one archived blog post ──
  // Named individually rather than `/blog/:path*` → `/blog`. Redirects are
  // checked before the filesystem, so the wildcard would swallow every future
  // post route the moment one is added — a redirect that breaks a page nobody
  // has written yet is the hardest kind to trace.
  r("/blog/spring-in-zakynthos", "/blog"),
];
