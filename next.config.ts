import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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