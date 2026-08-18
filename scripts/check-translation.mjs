#!/usr/bin/env node
/**
 * Reads the prerendered Greek pages and reports any English left in them.
 *
 * Works on the built HTML rather than on the source, because that is the only
 * thing that answers the question actually being asked: what does a Greek
 * visitor see? A dictionary can be complete while a component still hard-codes
 * a label, and a key can exist in both languages while nothing renders it.
 *
 * Run after `npm run build`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = ".next/server/app";

const PAGES = [
  ["/el",                "el.html"],
  ["/el/cars",           "el/cars.html"],
  ["/el/motorbikes",     "el/motorbikes.html"],
  ["/el/bikes",          "el/bikes.html"],
  ["/el/about",          "el/about.html"],
  ["/el/faq",            "el/faq.html"],
  ["/el/blog",           "el/blog.html"],
  ["/el/contact",        "el/contact.html"],
  ["/el/sights",         "el/sights.html"],
  ["/el/sitemap",        "el/sitemap.html"],
  ["/el/terms",          "el/terms.html"],
  ["/el/terms-of-use",   "el/terms-of-use.html"],
  ["/el/privacy-policy", "el/privacy-policy.html"],
  ["/el/quote",          "el/quote.html"],
];

/**
 * Latin-script text that belongs on a Greek page: brand and product names,
 * industry abbreviations everyone uses untranslated, and technical identifiers.
 * Anything Latin that is NOT here gets reported for a human to judge.
 */
const ALLOWED = new Set([
  // Brand and place names
  "anadyon", "rentals", "zakynthos", "zante", "ionian", "greece", "caretta",
  "navagio", "laganas", "keri", "gerakas", "kalamaki", "porto", "roxa",
  "limnionas", "kampi", "marathonissi", "sekania", "daphne", "koukla", "sostis",
  "agios", "lomvardou", "dionysios", "solomos", "smuggler",
  // Vehicle makes and models
  "hyundai", "nissan", "fiat", "toyota", "suzuki", "yamaha", "honda", "piaggio",
  "vespa", "kymco", "sym", "aprilia", "peugeot", "citroen", "renault", "opel",
  "volkswagen", "seat", "skoda", "ford", "kia", "mazda", "micra", "panda",
  "aygo", "picanto", "swift", "jimny", "corsa", "polo", "ibiza", "clio", "yaris",
  "scooter", "liberty", "beverly", "agility", "crypton", "mio", "activa", "sh",
  // Industry terms kept in English by every Greek rental site
  "cdw", "fdw", "gps", "acriss", "vat", "km", "cc", "abs",
  // Technical / infrastructure
  "recaptcha", "google", "analytics", "cookie", "cookies", "localstorage",
  "email", "blog", "html", "css", "js", "id", "url", "www", "http", "https",
  "ga", "gdpr", "llc", "us", "api", "sms", "pdf",
  // Punctuation-ish leftovers and units
  "copyright", "min", "max", "am", "pm",
]);

// Words that are unambiguously English UI copy — a hit here is a real miss,
// not a judgement call.
const RED_FLAGS = [
  "Contact Us", "Send Message", "Sending", "Our Details", "Office Hours",
  "Your name", "How can we help", "Message Sent", "Name is required",
  "Email address is required", "Message is required", "Read more",
  "Terms & Conditions", "Terms of Use", "Privacy Policy", "Sitemap",
  "All Cars", "All Motorbikes", "All Bikes", "About Us", "Zakynthos Sights",
  "Driver's Licence", "Driver's Age", "Credit Card", "Unlimited Mileage",
  "Insurance", "Cancellation", "Taxes", "Road Assistance", "Customer Service",
  "Who We Are", "Data Retention", "Your Rights", "Last updated",
  "Book Now", "Get a Quote", "Learn more", "Automatic", "Manual",
  "large bag", "small bag", "Free cancellation", "per day",
];

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let failures = 0;
let checked = 0;

console.log("  page                  greek   latin words needing review");
console.log("  ─────────────────────────────────────────────────────────");

for (const [route, file] of PAGES) {
  const path = join(OUT, file);
  if (!existsSync(path)) {
    console.log(`  ${route.padEnd(20)}  MISSING — not prerendered at ${path}`);
    failures++;
    continue;
  }
  checked++;
  const text = visibleText(readFileSync(path, "utf8"));

  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) ?? []).length;

  // Latin words of 3+ letters that are not on the allowlist.
  const latin = text.match(/\b[A-Za-z][A-Za-z'’-]{2,}\b/g) ?? [];
  const suspicious = [...new Set(latin.filter((w) => !ALLOWED.has(w.toLowerCase())))];

  const flags = RED_FLAGS.filter((phrase) => text.includes(phrase));

  const ok = greek > 100 && flags.length === 0;
  if (!ok) failures++;

  const summary = suspicious.length ? suspicious.slice(0, 6).join(", ") + (suspicious.length > 6 ? ` (+${suspicious.length - 6})` : "") : "—";
  console.log(`  ${route.padEnd(20)}  ${String(greek).padStart(5)}   ${summary}`);
  if (flags.length) {
    for (const f of flags) console.log(`  ${" ".repeat(20)}  ⚠ UNTRANSLATED: "${f}"`);
  }
  if (greek <= 100) console.log(`  ${" ".repeat(20)}  ⚠ almost no Greek text on this page`);
}

console.log("  ─────────────────────────────────────────────────────────");
console.log(`  ${checked}/${PAGES.length} pages checked, ${failures} with problems`);


// ── Source check ────────────────────────────────────────────────────────────
//
// The page scan above reads prerendered HTML, which is everything a visitor
// sees on load — but not the booking form, which only renders after a vehicle
// is chosen. That gap is how the entire form shipped in English while every
// page reported clean: the translations existed, and one missing `locale` prop
// meant nothing reached them.
//
// So the components are also checked directly for English UI text that never
// passes through the dictionary.

const COMPONENT_ROOTS = [
  "app/components", "app/contact", "app/faq",
  "app/cars", "app/bikes", "app/motorbikes",
  // The quote lookup is reached from the main navigation and from the link in
  // every confirmation email, and it was entirely English while /el/quote did
  // not exist at all — a 404 from the Greek nav.
  "app/quote",
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const IGNORE = /^(Mr|Mrs|Ms|OK|ID|VAT|CDW|FDW|GPS|ABS|Anadyon|Rentals|Zakynthos|Email|Blog|Google|reCAPTCHA)$/;

let sourceProblems = 0;
console.log("\n  component                                  hardcoded English");
console.log("  ─────────────────────────────────────────────────────────");

for (const root of COMPONENT_ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    const hits = new Set();

    // JSX text nodes: >Some English Text<
    // Entities are part of the text: "Can&apos;t find your reference?" failed to
    // match because ';' was missing from the class, and the string shipped.
    for (const m of src.matchAll(/>\s*([A-Z][A-Za-z][A-Za-z0-9 ,.'’!?()&;#-]{3,80})\s*</g)) {
      const text = m[1].trim();
      if (!IGNORE.test(text) && /[a-z]{3}/.test(text)) hits.add(text);
    }
    // Literal placeholders
    for (const m of src.matchAll(/placeholder="([^"]{3,60})"/g)) hits.add(`placeholder: ${m[1]}`);

    if (hits.size) {
      sourceProblems += hits.size;
      const list = [...hits].slice(0, 3).join(" · ");
      console.log(`  ${file.padEnd(42)} ${list}${hits.size > 3 ? ` (+${hits.size - 3})` : ""}`);
    }
  }
}

console.log("  ─────────────────────────────────────────────────────────");
console.log(`  ${sourceProblems} hardcoded string(s) in translated components`);
if (sourceProblems > 0) failures++;
process.exit(failures === 0 ? 0 : 1);
