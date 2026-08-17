#!/usr/bin/env node
/**
 * Fails when a column the migrations declare is missing from the deployed
 * database.
 *
 * This exists because the two had silently diverged. 001_baseline.sql declared
 * columns the live database never received, and nothing noticed until a quote
 * refused to convert. A full comparison then found four queries failing
 * outright — including the Stripe webhook's write of deposit_paid_at, which
 * meant a deposit could be charged and never recorded against the booking. That
 * failure was invisible: the webhook swallowed it, and the only symptom would
 * have been someone eventually asking why a paid reservation still showed as
 * pending.
 *
 * A schema mismatch should cost a red build, not a customer's payment.
 *
 *   node scripts/check-schema-drift.mjs
 *
 * Exits 0 when the deployed schema contains everything the migrations declare,
 * 1 when something is missing, and 2 when the check itself could not run —
 * those are kept distinct so a missing key is never mistaken for a clean pass.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

function loadEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.url && fromProcess.key) return fromProcess;

  // Fall back to .env.local for local runs; CI supplies real environment vars.
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    const env = Object.fromEntries(
      raw.split("\n").filter(l => l.includes("=")).map(l => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
    );
    return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
  } catch {
    return fromProcess;
  }
}

/**
 * Every column the migrations declare, as table → Set(column).
 *
 * Both forms have to be read: the baseline creates tables outright, while later
 * migrations add columns one at a time. Reading only CREATE TABLE would miss
 * everything added since, and reading only ALTER would miss the original schema.
 */
function declaredColumns() {
  const tables = new Map();
  const add = (t, c) => {
    if (!tables.has(t)) tables.set(t, new Set());
    tables.get(t).add(c);
  };

  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");

    // CREATE TABLE [IF NOT EXISTS] name ( ... );
    for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
      const table = m[1];
      for (const line of m[2].split("\n")) {
        // A column line starts at one indent level with a bare identifier.
        // Table-level constraints share that shape, so they are excluded by name.
        const col = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+\S/i);
        if (!col) continue;
        if (/^(primary|unique|constraint|check|foreign|references|exclude)$/i.test(col[1])) continue;
        add(table, col[1]);
      }
    }

    // ALTER TABLE name ADD COLUMN [IF NOT EXISTS] col ...
    for (const m of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)) {
      add(m[1], m[2]);
    }

    // A column dropped later is no longer expected.
    for (const m of sql.matchAll(/ALTER TABLE\s+(\w+)\s+DROP COLUMN(?:\s+IF EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)) {
      tables.get(m[1])?.delete(m[2]);
    }
  }

  return tables;
}

async function liveColumns(url, key) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`PostgREST returned ${res.status} fetching the schema`);
  const spec = await res.json();
  const out = new Map();
  for (const [table, def] of Object.entries(spec?.definitions ?? {})) {
    out.set(table, new Set(Object.keys(def?.properties ?? {})));
  }
  return out;
}

const { url, key } = loadEnv();
if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

let live;
try {
  live = await liveColumns(url, key);
} catch (err) {
  console.error(`✗ Could not read the deployed schema: ${err.message}`);
  process.exit(2);
}

const declared = declaredColumns();
const problems = [];
let checkedTables = 0;
let checkedColumns = 0;

for (const [table, columns] of declared) {
  const liveCols = live.get(table);
  // A table absent from PostgREST is not necessarily missing — it may simply
  // not be exposed through the API — so only tables it serves are compared.
  if (!liveCols) continue;
  checkedTables++;
  checkedColumns += columns.size;
  const missing = [...columns].filter(c => !liveCols.has(c));
  if (missing.length) problems.push({ table, missing });
}

if (problems.length === 0) {
  console.log(`✓ Schema matches: ${checkedColumns} columns across ${checkedTables} tables.`);
  process.exit(0);
}

console.error("✗ Columns the migrations declare are missing from the deployed database:\n");
for (const { table, missing } of problems) {
  console.error(`    ${table}`);
  for (const c of missing) console.error(`        ${c}`);
}
console.error(
  "\n  Run the outstanding migration in the Supabase SQL editor, then re-run this check." +
  "\n  Code that selects a missing column fails at request time, not at build time."
);
process.exit(1);
