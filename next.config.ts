import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { RECAPTCHA_TEST_SITE_KEY, isLiveSite } from "./lib/recaptchaKeys";
import { sentryIngestOriginFromDsn } from "./lib/sentryPrivacy";

/**
 * Refuses to build a production bundle carrying Google's reCAPTCHA test key.
 *
 * `verifyRecaptcha` already refuses the test *secret* on the live site. On
 * 2026-08-24 the mirror image happened instead: the test *site key* reached
 * production while the secret stayed real. The runtime guard could not see it,
 * because a `NEXT_PUBLIC_` value is inlined into the browser bundle at build
 * time and never passes through the verifier at all.
 *
 * The result was worse than a loud failure. Tokens were issued against one key
 * pair and checked against another, so Google rejected every one and the
 * booking and contact forms quietly refused all submissions — indistinguishable
 * from customers failing the CAPTCHA.
 *
 * Build time is the only place this is catchable, so it is caught here. A
 * failed deployment is recoverable in minutes; a live form that silently
 * declines every booking is not.
 */
function assertRecaptchaKeyIsNotTheTestOne(): void {
  const configured = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim();
  if (!isLiveSite() || configured !== RECAPTCHA_TEST_SITE_KEY) return;

  throw new Error(
    "Refusing to build: NEXT_PUBLIC_RECAPTCHA_SITE_KEY is Google's test site key " +
    "and this is a production build. Tokens would be issued against the test key " +
    "and verified against the real secret, so every booking and contact " +
    "submission would be rejected. Scope that variable to Preview only, then " +
    "redeploy.",
  );
}

assertRecaptchaKeyIsNotTheTestOne();

// Script origins the site genuinely loads, confirmed by watching the network on
// a rendered page rather than by reading the source: reCAPTCHA pulls from
// www.google.com and www.gstatic.com, and Google Tag Manager only after cookie
// consent.
const SCRIPT_SOURCES =
  "'self' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://www.google-analytics.com https://www.recaptcha.net";

const BASE_CONNECT_SOURCES =
  "'self' https://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";
const SENTRY_INGEST_ORIGIN = sentryIngestOriginFromDsn(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
);

/** Directives shared by the enforced and the report-only policy. */
const BASE_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // Tightened from `https:`, which allowed an image from any origin on the web.
  // next.config's remotePatterns is empty and every image on the site is served
  // from /public through /_next/image, so nothing legitimate needs the wildcard.
  // Verified on a rendered page: zero external images, zero url() in CSS.
  //
  // The two Google hosts are not decoration: GA4 falls back to an image beacon
  // when sendBeacon and fetch are unavailable, and Google's CSP guide lists
  // them as required. Without them that fallback fails silently, which is
  // exactly how the connect-src gap below went unnoticed.
  "img-src 'self' data: blob: https://*.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  // GA4 does not send hits to www.google-analytics.com. It sends them to a
  // REGIONAL endpoint chosen by the visitor's geography — region1 for the EU,
  // which is effectively all of our traffic. Allowing only the www host meant
  // every European page_view was refused by our own policy, so Analytics
  // recorded nothing from launch until this was caught in the browser console.
  //
  // Hosts below are from Google's CSP guide, minus the Advertising Features
  // endpoints (doubleclick, google.<TLD>, googlesyndication). Google suggests
  // adding those pre-emptively in case Ads is linked later; we do not run Ads,
  // and a policy is only worth having if it stays as narrow as the site's
  // actual behaviour. Link Google Ads and this needs revisiting.
  `connect-src ${BASE_CONNECT_SOURCES}${SENTRY_INGEST_ORIGIN ? ` ${SENTRY_INGEST_ORIGIN}` : ""}`,
  "frame-src https://www.google.com https://www.recaptcha.net",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      ...BASE_CSP,
      // Next.js injects inline bootstrap and hydration scripts. Removing this
      // needs per-request nonces, which is what the Report-Only policy below is
      // measuring the cost of.
      `script-src ${SCRIPT_SOURCES} 'unsafe-inline'`,
      // Violations of the ENFORCED policy are real breakage and worth seeing.
      "report-uri /api/csp-report",
      "report-to csp",
    ].join("; "),
  },
  {
    // The policy we want, measured rather than enforced: identical to the
    // enforced one but without 'unsafe-inline' for scripts.
    //
    // Deliberately NOT 'strict-dynamic' and NOT require-trusted-types-for.
    // Both were tried and both report every script on the page as a violation —
    // strict-dynamic ignores the host allowlist unless each script carries a
    // nonce, and neither Next.js nor React emits Trusted Types assignments. The
    // result is a report stream that says "everything", which answers nothing.
    //
    // Dropping only 'unsafe-inline' reports exactly the inline scripts that
    // would need a nonce, which is the one fact needed to decide whether the
    // strict policy can be enforced. Nothing here can break the site.
    key: "Content-Security-Policy-Report-Only",
    value: [
      ...BASE_CSP,
      `script-src ${SCRIPT_SOURCES}`,
      "report-uri /api/csp-report",
      "report-to csp",
    ].join("; "),
  },
  {
    // Endpoint declaration for the modern Reporting API; report-uri above
    // covers browsers that still use the Level 2 mechanism.
    key: "Reporting-Endpoints",
    value: 'csp="/api/csp-report"',
  },
];

const nextConfig: NextConfig = {
  /**
   * One canonical host.
   *
   * Both anadyon.gr and www.anadyon.gr served the site directly with a 200, so
   * every page existed at two addresses — search engines have to guess which is
   * authoritative, and link equity splits between them. The canonical tags
   * already name the apex; this makes the server agree.
   *
   * 308 rather than 301: it preserves the request method, so a form posted to
   * the www host still arrives as a POST rather than being rewritten to GET.
   * Path and query are carried across by :path*.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.anadyon.gr" }],
        destination: "https://anadyon.gr/:path*",
        permanent: true,
      },
      {
        // This was the original public Vercel deployment address. Leaving it
        // serving the site creates a second, indexable origin outside the
        // canonical-domain policy. Keep the address harmless for any old
        // bookmark, but send every request — including its path and query —
        // to the real public domain.
        source: "/:path*",
        has: [{ type: "host", value: "anadyon-eight.vercel.app" }],
        destination: "https://anadyon.gr/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Photographs in /public are served with Vercel's default
        // `max-age=0, must-revalidate` and carry no ETag, so a visitor moving
        // from /cars to /motorbikes to /quote re-downloads every shared image.
        // A day of freshness plus a month of stale-while-revalidate makes the
        // second page view free while still letting a replaced photo roll out
        // on its own — and renaming the file publishes one immediately.
        source: "/:path*.(jpg|jpeg|png|webp|avif|svg|ico)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=2592000" },
        ],
      },
    ];
  },
  images: {
    // Every image on the site is served from /public. No remote patterns are
    // allowed: the previous list named twelve third-party hosts (including a
    // competitor's) that nothing referenced, which widened the image-optimiser
    // surface for no benefit.
    remotePatterns: [],

    // AVIF first, WebP for anything that cannot take it. AVIF runs roughly
    // 30-50% smaller than JPEG at matching visual quality, which is what lets
    // the source photos stay high-resolution without the pages getting heavier.
    // Order matters — the browser is offered the first format it accepts.
    formats: ["image/avif", "image/webp"],

    // Next 16 only honours quality values declared here, so 75 has to stay: it
    // is the built-in default and dropping it would reject any <Image> that does
    // not name a quality. 82 is the vehicle-photo setting — clean panel
    // gradients and legible badge text, well short of the point where the extra
    // bytes stop being visible.
    qualities: [75, 82],

    // The stock list runs to 3840px. Nothing here is served above 1600, and the
    // largest layout slot is the full-bleed hero, so the wider entries would only
    // add cache permutations that never get a hit.
    deviceSizes: [640, 750, 828, 1080, 1200, 1600],

    // Card artwork sits at 224-352px depending on breakpoint; 288 and 384 cover
    // the 1x and the retina case for the md:w-72 slots.
    imageSizes: [96, 128, 224, 288, 384],

    // Vehicle photography is replaced rarely, so a long immutable cache is safe
    // and keeps repeat visits off the optimiser entirely.
    minimumCacheTTL: 60 * 60 * 24 * 365,
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

const sentryBuild = sentryAuthToken ? withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG?.trim() || undefined,
  project: process.env.SENTRY_PROJECT?.trim() || undefined,
  authToken: sentryAuthToken || undefined,
  silent: true,
  telemetry: false,
  // Local and unconfigured preview builds must remain reproducible. Source
  // maps are uploaded only when the dedicated build credential is present,
  // then removed from the client artifact rather than published to visitors.
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  // These apply to the Turbopack production build as well as webpack. Tracing
  // is disabled in runtime options and removed here; Replay is never added.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
  },
}) : nextConfig;

// Runtime reporting does not depend on the build plugin. Without its secret
// token, export the untouched Next config: this skips source-map upload and its
// Turbopack loaders entirely instead of making an unconfigured build fail.
export default sentryBuild;
