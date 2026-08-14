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
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "anadyon.gr",
      },
      {
        protocol: "https",
        hostname: "kymco.gr",
      },
      {
        protocol: "https",
        hostname: "xobikes.com",
      },
      {
        protocol: "https",
        hostname: "www.idealbikes.net",
      },
      {
        protocol: "https",
        hostname: "unitedbycycling.com",
      },
      {
        protocol: "https",
        hostname: "sela.gr",
      },
      {
        protocol: "https",
        hostname: "content.easyliveauction.com",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "assets.specialized.com",
      },
      {
        protocol: "https",
        hostname: "static.cyclelab.eu",
      },
      {
        protocol: "https",
        hostname: "loukisrental.gr",
      },
      {
        protocol: "https",
        hostname: "img.cdn-cnj.si",
      },
    ],
  },
};

export default nextConfig;