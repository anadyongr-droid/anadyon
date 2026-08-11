import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/quote/"],
      },
    ],
    sitemap: "https://anadyon.gr/sitemap.xml",
  };
}
