import { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anadyon.gr";

/**
 * Only the canonical production host invites crawling.
 *
 * Every Vercel deployment gets its own hostname, and each one served the same
 * permissive robots file while canonicalising to anadyon.gr. That is a request
 * to index a host whose content claims to live somewhere else — the mildest
 * outcome is a wasted crawl budget, the worse one is a preview URL ranking for
 * the business's own name.
 *
 * VERCEL_ENV is "production" only for the production deployment, so preview and
 * branch builds refuse crawling outright without any per-environment
 * configuration to remember.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV;

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /quote/ carries a customer's own reference; it is reachable by link
        // but has no business in an index.
        disallow: ["/admin/", "/api/", "/quote/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
