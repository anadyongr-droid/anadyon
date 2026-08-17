import type { NextConfig } from "next";

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
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://www.google-analytics.com https://www.recaptcha.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://www.googletagmanager.com",
      "frame-src https://www.google.com https://www.recaptcha.net",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
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

export default nextConfig;