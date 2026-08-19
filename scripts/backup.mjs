#!/usr/bin/env node
/**
 * Exports every table to timestamped JSON.
 *
 * The Supabase Free plan takes no backups at all. Their documentation is
 * explicit: daily backups cover "Pro, Team, and Enterprise Plan projects", and
 * free projects are told to "regularly export their data ... and maintain
 * off-site backups". Until this script existed, a mistaken DELETE or a dropped
 * table would have taken every booking and customer with it, permanently.
 *
 * It works through PostgREST with the service-role key, because the usual
 * tools are unavailable here: there is no Supabase CLI, no pg_dump, and no
 * direct Postgres connection string in the environment — only the REST keys.
 *
 * WHAT THIS SAVES: the contents of every table.
 * WHAT IT DOES NOT: the schema, RLS policies, functions, triggers, or the auth
 * users. Those live in supabase/migrations, which is in git, and that is the
 * other half of a restore. Auth accounts are not covered at all — there are
 * three of them and they are recreated from the Users screen.
 *
 * Restoring, in order:
 *   1. Create a project and run every migration in supabase/migrations.
 *   2. `node scripts/backup.mjs --restore <dir>` to load the rows back.
 *   3. Recreate the admin accounts and set app_metadata.role on each.
 *
 * Usage:
 *   node scripts/backup.mjs                  → writes ./backups/<timestamp>/
 *   node scripts/backup.mjs --out /some/dir  → writes elsewhere
 *   node scripts/backup.mjs --restore <dir>  → loads a backup back in
 *
 * Keep the output OFF this machine. A backup sitting on the same disk as the
 * thing it protects is not a backup, and one sitting next to the repository is
 * a customer database waiting to be committed by accident — hence the
 * .gitignore entry.
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.error("Run with:  set -a; . ./.env.local; set +a; node scripts/backup.mjs");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/** PostgREST caps a response; anything larger has to be walked in pages. */
const PAGE = 1000;

async function tableNames() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers });
  if (!res.ok) throw new Error(`could not read the schema: HTTP ${res.status}`);
  const spec = await res.json();
  return Object.keys(spec.definitions ?? {}).sort();
}

async function dumpTable(name) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${name}?select=*`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    // A short page means the end; without this the loop never terminates on a
    // table whose row count is an exact multiple of the page size.
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function backup(outRoot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(outRoot, stamp);
  mkdirSync(dir, { recursive: true });

  const names = await tableNames();
  const summary = [];
  let total = 0;

  for (const name of names) {
    try {
      const rows = await dumpTable(name);
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows, null, 2));
      summary.push({ table: name, rows: rows.length });
      total += rows.length;
      console.log(`  ${name.padEnd(24)} ${String(rows.length).padStart(6)} rows`);
    } catch (err) {
      // One unreadable table must not cost the other sixteen.
      console.error(`  ${name.padEnd(24)} FAILED: ${err.message.slice(0, 80)}`);
      summary.push({ table: name, rows: null, error: String(err.message).slice(0, 200) });
    }
  }

  writeFileSync(join(dir, "_manifest.json"), JSON.stringify({
    takenAt: new Date().toISOString(),
    project: URL_BASE,
    tables: summary,
    totalRows: total,
    note: "Data only. Schema lives in supabase/migrations; auth accounts are not included.",
  }, null, 2));

  // Records that a backup happened, so the daily health check can say when one
  // has not. A manual chore nobody is reminded about is a chore that stops
  // getting done, and the failure is silent until the day it matters.
  const failedEarly = summary.filter((s) => s.rows === null);
  if (!failedEarly.length) {
    const res = await fetch(`${URL_BASE}/rest/v1/system_settings`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        key: "last_backup_at",
        value: JSON.stringify({ at: new Date().toISOString(), tables: names.length, rows: total }),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) console.warn(`  (could not record the backup time: HTTP ${res.status})`);
  }

  const failed = summary.filter((s) => s.rows === null);
  console.log(`\n  ${names.length - failed.length}/${names.length} tables, ${total} rows → ${dir}`);
  if (failed.length) {
    console.error(`  ${failed.length} table(s) failed — this backup is incomplete.`);
    process.exit(1);
  }
  console.log("  Copy this directory somewhere that is not this machine.");
}

async function restore(dir) {
  if (!existsSync(dir)) { console.error(`no such directory: ${dir}`); process.exit(1); }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_manifest.json");

  console.log(`  Restoring ${files.length} tables into ${URL_BASE}`);
  console.log("  Existing rows with matching primary keys will be overwritten.\n");

  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const rows = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!rows.length) { console.log(`  ${name.padEnd(24)} empty, skipped`); continue; }

    // Inserted in pages: one request carrying tens of thousands of rows is
    // refused, and a partial failure is easier to read a page at a time.
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const res = await fetch(`${URL_BASE}/rest/v1/${name}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(slice),
      });
      if (!res.ok) {
        console.error(`  ${name.padEnd(24)} FAILED at row ${i}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
        break;
      }
      done += slice.length;
    }
    console.log(`  ${name.padEnd(24)} ${String(done).padStart(6)} rows restored`);
  }
  console.log("\n  Remember: schema comes from supabase/migrations, and the admin");
  console.log("  accounts have to be recreated with their roles.");
}

const args = process.argv.slice(2);
const restoreIdx = args.indexOf("--restore");
const outIdx = args.indexOf("--out");

if (restoreIdx !== -1) {
  await restore(args[restoreIdx + 1]);
} else {
  await backup(outIdx !== -1 ? args[outIdx + 1] : "./backups");
}
