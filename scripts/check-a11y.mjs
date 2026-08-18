#!/usr/bin/env node
/**
 * Runs axe-core against every prerendered page.
 *
 * Works on the built HTML rather than a live browser: it needs no server, runs
 * in a couple of seconds, and can therefore sit in CI on every push. The
 * trade-off is honest and worth stating — this catches the structural half of
 * accessibility (labels, names, roles, contrast, heading order, landmarks) and
 * cannot catch the interactive half: focus order through a modal, what a screen
 * reader announces after a form error, whether a menu traps focus. Those still
 * need a person with a keyboard.
 *
 * Run after `npm run build`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const OUT = ".next/server/app";

/** Rules that cannot be judged from static HTML, and would only produce noise. */
const IRRELEVANT = new Set([
  // Needs the real layout engine; jsdom computes no geometry.
  "target-size",
  // Fires on every fragment because jsdom has no viewport.
  "scrollable-region-focusable",
]);

/**
 * Colour contrast needs real rendering, which jsdom does not do — axe skips it
 * and would silently report a clean page. Saying so is better than implying
 * coverage that is not there.
 */
const NOT_COVERED = ["colour contrast", "focus order", "screen-reader announcements"];

function pagesToCheck() {
  const found = [];
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`);
      else if (entry.endsWith(".html")) {
        const route = `${prefix}/${entry.replace(/\.html$/, "")}`.replace(/\/index$/, "") || "/";
        // Error pages and admin are not part of the public journey.
        if (route.startsWith("/_") || route.startsWith("/admin")) continue;
        found.push([route, full]);
      }
    }
  };
  if (!existsSync(OUT)) {
    console.error(`  ${OUT} not found — run \`npm run build\` first.`);
    process.exit(2);
  }
  walk(OUT);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
}

const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

async function auditPage(html) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    // jsdom logs "Not implemented: HTMLCanvasElement's getContext()" for every
    // page. Nothing here needs canvas; the noise buried the actual findings.
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  // jsdom implements neither of these; axe probes for them and throws without.
  window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  window.eval(axeSource);
  const results = await window.axe.run(window.document, {
    resultTypes: ["violations"],
    rules: Object.fromEntries([...IRRELEVANT].map((id) => [id, { enabled: false }])),
  });
  dom.window.close();
  return results.violations;
}

const pages = pagesToCheck();
const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const aggregated = new Map();
let failed = 0;

console.log(`  ${pages.length} pages · axe-core ${JSON.parse(readFileSync("node_modules/axe-core/package.json", "utf8")).version}\n`);
console.log(`  ${"page".padEnd(22)} violations`);
console.log("  " + "─".repeat(58));

for (const [route, file] of pages) {
  let violations;
  try {
    violations = await auditPage(readFileSync(file, "utf8"));
  } catch (err) {
    console.log(`  ${route.padEnd(22)} could not audit: ${err.message.slice(0, 40)}`);
    failed++;
    continue;
  }
  for (const v of violations) {
    bySeverity[v.impact] = (bySeverity[v.impact] ?? 0) + v.nodes.length;
    const entry = aggregated.get(v.id) ?? { impact: v.impact, help: v.help, pages: new Set(), example: "" };
    entry.pages.add(route);
    entry.example ||= (v.nodes[0]?.html ?? "").slice(0, 90);
    aggregated.set(v.id, entry);
  }
  const total = violations.reduce((n, v) => n + v.nodes.length, 0);
  console.log(`  ${route.padEnd(22)} ${total === 0 ? "clean" : `${total} across ${violations.length} rule(s)`}`);
}

console.log("  " + "─".repeat(58));

if (aggregated.size === 0) {
  console.log("  No violations axe can detect in static HTML.");
} else {
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const sorted = [...aggregated.entries()].sort((a, b) => order[a[1].impact] - order[b[1].impact]);
  console.log("\n  rule                        impact     pages  what it means");
  console.log("  " + "─".repeat(88));
  for (const [id, v] of sorted) {
    console.log(`  ${id.padEnd(27)} ${String(v.impact).padEnd(10)} ${String(v.pages.size).padStart(5)}  ${v.help}`);
    if (v.example) console.log(`  ${" ".repeat(45)}${v.example}`);
  }
}

console.log("\n  " + Object.entries(bySeverity).map(([k, n]) => `${k}: ${n}`).join("   "));
console.log(`  not covered by this check: ${NOT_COVERED.join(", ")} — these need a keyboard and a person.`);

// Critical and serious block; moderate and minor are reported and tolerated.
const blocking = bySeverity.critical + bySeverity.serious;
if (blocking > 0) console.log(`\n  ${blocking} critical/serious violation(s) — failing.`);
process.exit(blocking > 0 || failed > 0 ? 1 : 0);
