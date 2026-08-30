#!/usr/bin/env node
/**
 * Fails when the migrations and the deployed database disagree, in either
 * direction.
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
 * BOTH DIRECTIONS, since 30 August. The original check only asked "does the
 * database have everything the migrations declare?". It never asked the
 * reverse, and the reverse is where `customers.name` had been hiding since
 * before the migration files existed: 001_baseline.sql uses CREATE TABLE IF NOT
 * EXISTS on tables the hand-made supabase/schema.sql had already made, so the
 * baseline was a no-op in production and that column survived underneath it.
 * Nothing here could have found it. A replay into an empty database tripped
 * over it by accident, which is not a way of finding things.
 *
 *   node scripts/check-schema-drift.mjs
 *
 * Exits 0 when the deployed schema contains everything the migrations declare,
 * 1 when something is missing, and 2 when the check itself could not run —
 * those are kept distinct so a missing key is never mistaken for a clean pass.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { declaredColumns, declaredViews, UNDECLARED_ALLOWLIST } from "./schemaDeclarations.mjs";

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

const declared = declaredColumns(MIGRATIONS);
const views = declaredViews(MIGRATIONS);
const problems = [];
const undeclared = [];
const excused = [];
let checkedTables = 0;
let checkedColumns = 0;

for (const [table, columns] of declared) {
  const liveCols = live.get(table);
  // A table absent from PostgREST is not necessarily missing — it may simply
  // not be exposed through the API — so only tables it serves are compared.
  if (!liveCols) continue;
  checkedTables++;
  checkedColumns += columns.size;

  // Forward: declared but not deployed. Code selecting one of these fails at
  // request time.
  const missing = [...columns].filter(c => !liveCols.has(c));
  if (missing.length) problems.push({ table, missing });

  // Reverse: deployed but not declared. Code never touches these, so nothing
  // breaks today — but a replay into an empty database will not produce them,
  // which means a staging database silently differs from production. Views are
  // skipped: their columns come from a SELECT list, which is not a declaration
  // this parser reads.
  if (views.has(table)) continue;
  const extra = [...liveCols].filter(c => !columns.has(c));
  for (const c of extra) {
    const reason = UNDECLARED_ALLOWLIST.get(`${table}.${c}`);
    (reason ? excused : undeclared).push({ table, column: c, reason });
  }
}

if (excused.length) {
  console.log("· Undeclared columns with a recorded reason:");
  for (const { table, column, reason } of excused) {
    console.log(`    ${table}.${column} — ${reason}`);
  }
  console.log("");
}

if (problems.length === 0 && undeclared.length === 0) {
  console.log(
    `✓ Schema matches in both directions: ${checkedColumns} columns across ${checkedTables} tables` +
    `${excused.length ? `, ${excused.length} excused` : ""}.`
  );
  process.exit(0);
}

if (problems.length) {
  console.error("✗ Columns the migrations declare are missing from the deployed database:\n");
  for (const { table, missing } of problems) {
    console.error(`    ${table}`);
    for (const c of missing) console.error(`        ${c}`);
  }
  console.error(
    "\n  Run the outstanding migration in the Supabase SQL editor, then re-run this check." +
    "\n  Code that selects a missing column fails at request time, not at build time.\n"
  );
}

if (undeclared.length) {
  console.error("✗ Columns the deployed database has that no migration declares:\n");
  for (const { table, column } of undeclared) console.error(`    ${table}.${column}`);
  console.error(
    "\n  Nothing is broken today — no code selects these. What breaks is a rebuild:" +
    "\n  replaying the migrations into an empty database will not produce them, so a" +
    "\n  staging or restored database differs from production without saying so." +
    "\n  Either write the migration that declares the column, or add it to" +
    "\n  UNDECLARED_ALLOWLIST in scripts/schemaDeclarations.mjs with a reason and an exit.\n"
  );
}

process.exit(1);
