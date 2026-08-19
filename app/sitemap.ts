import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://anadyon.gr";
  // Content dates, updated when a page's copy actually changes. Reporting
  // "now" on every crawl is a signal search engines learn to disregard.
  const CONTENT_UPDATED: Record<string, string> = {
    "":                "2026-08-18",
    "/cars":           "2026-08-18",
    "/motorbikes":     "2026-08-18",
    "/bikes":          "2026-08-18",
    "/contact":        "2026-08-11",
    "/about":          "2026-08-11",
    "/sights":         "2026-08-11",
    "/faq":            "2026-08-18",
    "/blog":           "2026-08-11",
    "/sitemap":        "2026-08-11",
    "/terms":          "2026-08-18",
    "/terms-of-use":   "2026-08-17",
    "/privacy-policy": "2026-08-17",
  };
  const dateFor = (path: string) => new Date(CONTENT_UPDATED[path] ?? "2026-08-11");

  // Every Greek page was written or completed on 19 August. Reporting the
  // English page's older date against the Greek URL would understate a genuine
  // change; reporting today against the English one would overstate it.
  const GREEK_COMPLETED = new Date("2026-08-19");
  const greekDateFor = (path: string) =>
    dateFor(path) > GREEK_COMPLETED ? dateFor(path) : GREEK_COMPLETED;

  // Paths only, so the Greek set is derived rather than maintained twice — a
  // second hand-written list would drift the moment a page is added.
  const paths: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
    { path: "",                changeFrequency: "weekly",  priority: 1 },
    { path: "/cars",           changeFrequency: "weekly",  priority: 0.9 },
    { path: "/motorbikes",     changeFrequency: "weekly",  priority: 0.9 },
    { path: "/bikes",          changeFrequency: "weekly",  priority: 0.9 },
    { path: "/contact",        changeFrequency: "monthly", priority: 0.8 },
    { path: "/about",          changeFrequency: "monthly", priority: 0.7 },
    { path: "/sights",         changeFrequency: "monthly", priority: 0.6 },
    { path: "/faq",            changeFrequency: "monthly", priority: 0.6 },
    { path: "/terms",          changeFrequency: "yearly",  priority: 0.3 },
    { path: "/terms-of-use",   changeFrequency: "yearly",  priority: 0.3 },
    { path: "/privacy-policy", changeFrequency: "yearly",  priority: 0.3 },
    // Both were absent; a page missing from the sitemap is a page the crawler
    // reaches only by following a link, if it follows one.
    { path: "/blog",           changeFrequency: "monthly", priority: 0.5 },
    { path: "/sitemap",        changeFrequency: "yearly",  priority: 0.2 },
  ];

  return paths.flatMap(({ path, changeFrequency, priority }) => [
    {
      url: `${base}${path}` || base,
      lastModified: dateFor(path),
      changeFrequency,
      priority,
      // Declares the language pair to search engines, so the two versions are
      // read as translations rather than as duplicates competing with one
      // another for the same query.
      alternates: {
        languages: {
          en: `${base}${path}` || base,
          el: `${base}/el${path}`,
          // Which page a visitor gets when their language matches neither.
          // English, because it is what most arrivals to Zakynthos read.
          "x-default": `${base}${path}` || base,
        },
      },
    },
    {
      url: `${base}/el${path}`,
      lastModified: greekDateFor(path),
      changeFrequency,
      // Equal to the English. The 10% reduction here dated from when the Greek
      // copy was half-finished and the complete pages deserved preference —
      // both languages are now complete, and for a Greek business telling
      // search engines the Greek pages matter less is the wrong way round.
      priority,
      alternates: {
        languages: {
          en: `${base}${path}` || base,
          el: `${base}/el${path}`,
          // Which page a visitor gets when their language matches neither.
          // English, because it is what most arrivals to Zakynthos read.
          "x-default": `${base}${path}` || base,
        },
      },
    },
  ]);
}
