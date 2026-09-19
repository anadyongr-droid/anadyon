#!/usr/bin/env node
/**
 * Finds links into and inside this site that no longer resolve.
 *
 * Written on 19 September 2026, after a Google Analytics referral showed a
 * French travel guide sending readers to `https://anadyon.gr/en/` — a URL this
 * site has never served. Nobody had noticed, because a 404 costs a visitor
 * silently: they see a blank page and leave, and nothing in the system records
 * that the link was ever followed.
 *
 * Two passes, and they answer different questions.
 *
 *   1. INTERNAL. Crawl every page in sitemap.xml, collect every same-origin
 *      <a href> on it, and check each one resolves. Catches links we broke
 *      ourselves, which is the only class we can fix at the source.
 *
 *   2. INBOUND. Check the URLs in docs/inbound-links.json — the ones other
 *      people have published at us. This is the class the /en referral belongs
 *      to: we cannot edit their link, so the URL has to keep working forever.
 *
 * What this deliberately does NOT claim to be is a backlink audit. It cannot be
 * one. Backlinks live on other people's servers, and no request from ours can
 * enumerate them; the complete lists are held by Google Search Console, Bing
 * Webmaster Tools and the commercial crawlers. docs/INBOUND-LINKS.md says how to
 * get them, and what to do with what they return. A script that swept our own
 * pages and reported "all links healthy" would be answering an easier question
 * than the one that was asked, so this one says which pass it ran.
 *
 * Usage:
 *   npm run check:links                        # against a local `next start`
 *   npm run check:links -- --base https://anadyon.gr
 *   npm run check:links -- --inbound-only      # skips the crawl; no server needed
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = (flag("base", "http://127.0.0.1:3100")).replace(/\/$/, "");
const INBOUND_ONLY = args.includes("--inbound-only");
const TIMEOUT_MS = Number(flag("timeout", "20000"));

/** GET rather than HEAD: some hosts answer HEAD differently, or not at all. */
async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "anadyon-link-check" },
    });
    return { url, status: res.status, finalUrl: res.url, ms: Date.now() - started };
  } catch (err) {
    return { url, status: 0, error: err.message, ms: Date.now() - started };
  }
}

/** Bounded concurrency. A link checker that opens 200 sockets tests the server, not the links. */
async function mapLimit(items, limit, fn) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Same-origin hrefs only, and only ones a crawler would follow.
 *
 * `mailto:` and `tel:` are links but not pages; a fragment is the page it is
 * already on. Including them produces noise that trains the reader to skim the
 * report, which is how a real broken link gets missed.
 */
function pageLinks(html, pageUrl) {
  const found = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)) {
    const raw = m[1];
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    let resolved;
    try { resolved = new URL(raw, pageUrl); } catch { continue; }
    if (resolved.origin !== new URL(BASE).origin) continue;
    resolved.hash = "";
    found.add(resolved.toString());
  }
  return [...found];
}

const problems = [];
const ran = [];

// ── Pass 2 first: it needs no local server, so it still runs under --inbound-only.
{
  const register = JSON.parse(readFileSync(new URL("../docs/inbound-links.json", import.meta.url), "utf8"));

  /**
   * Point a published URL at whichever host is being checked.
   *
   * Without this the inbound pass always hits production, so it can only ever
   * report a break after it has shipped — useless as a pre-merge gate, which is
   * the one place it would have caught /en before a stranger did. Rewriting the
   * path onto --base lets the same register be run against a local build.
   *
   * `hostSpecific` entries opt out, because for them the host IS the assertion:
   * rewriting www.anadyon.gr onto 127.0.0.1 would test nothing and pass.
   */
  const aimed = register.links.map((l) => {
    if (l.hostSpecific) return l.url;
    const u = new URL(l.url);
    if (!/^(www\.)?anadyon\.gr$/.test(u.hostname)) return l.url;
    return `${BASE}${u.pathname}${u.search}`;
  });

  const results = await mapLimit(aimed, 6, probe);
  ran.push(`inbound: ${results.length} published URL(s)`);

  results.forEach((r, i) => {
    const entry = register.links[i];
    if (r.status >= 200 && r.status < 300) return;
    problems.push(
      `INBOUND ${r.status || r.error}  ${r.url}\n` +
      `         published by ${entry.publishedBy} (${entry.found})\n` +
      `         ${entry.note}`,
    );
  });
}

if (!INBOUND_ONLY) {
  const sitemapRes = await fetch(`${BASE}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!sitemapRes?.ok) {
    console.error(`Could not read ${BASE}/sitemap.xml — is the server up? (npm run build && npx next start -p 3100)`);
    console.error("Run with --inbound-only to check published URLs without a server.");
    process.exit(2);
  }

  const pages = sitemapUrls(await sitemapRes.text()).map((u) => u.replace(/^https:\/\/anadyon\.gr/, BASE));
  ran.push(`internal: ${pages.length} page(s) from sitemap.xml`);

  // Every sitemap entry must itself resolve. A sitemap that lists a 404 is worse
  // than one that omits the page: it actively sends crawlers at a dead URL.
  const pageResults = await mapLimit(pages, 6, probe);
  for (const r of pageResults) {
    if (r.status < 200 || r.status >= 300) problems.push(`SITEMAP ${r.status || r.error}  ${r.url}`);
  }

  // Then every link those pages carry.
  const targets = new Map(); // url -> pages that link to it
  for (const r of pageResults) {
    if (r.status < 200 || r.status >= 300) continue;
    const html = await fetch(r.url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((x) => x.text());
    for (const link of pageLinks(html, r.url)) {
      if (!targets.has(link)) targets.set(link, []);
      targets.get(link).push(new URL(r.url).pathname);
    }
  }

  const linkResults = await mapLimit([...targets.keys()], 6, probe);
  ran.push(`internal: ${linkResults.length} distinct link target(s)`);
  for (const r of linkResults) {
    if (r.status >= 200 && r.status < 300) continue;
    problems.push(`LINK    ${r.status || r.error}  ${r.url}\n         linked from ${targets.get(r.url).join(", ")}`);
  }
}

console.log(`Checked against ${BASE}${INBOUND_ONLY ? " (inbound only)" : ""}`);
ran.forEach((line) => console.log(`  ${line}`));

if (problems.length) {
  console.error(`\n${problems.length} broken link(s):\n`);
  problems.forEach((p) => console.error(`  ${p}\n`));
  process.exit(1);
}
console.log("\nNo broken links.");
console.log("Note: this checks the URLs we know about. It cannot enumerate backlinks —");
console.log("see docs/INBOUND-LINKS.md for the Search Console and Bing exports that can.");
