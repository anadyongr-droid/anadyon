#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Decides whether a restored archive is a usable copy of production.
 *
 * **Why this exists.** Until today the backup had three automated checks and
 * none of them opened an archive that had been stored. The nightly job
 * decrypts the file it has just made, in memory, before uploading it;
 * `backup-inventory.yml` lists the bucket. A bucket of thirty undecryptable
 * objects passes both. E23 has been open since the backups began for exactly
 * this reason, and "do the restore drill" was a person's errand nobody had
 * time for.
 *
 * It does not have to be. The archive, the passphrase and a disposable
 * Postgres all fit inside one Actions job, so the drill can run on a schedule
 * like anything else.
 *
 * **The comparison is against production itself**, using the same
 * `scripts/sql/production-counts.sql` the nightly fingerprint uses — one JSON
 * object of `{table: rows}`. That file's own header explains why a count is
 * the right currency here: it runs against customers' addresses and dates of
 * birth, and a cardinality cannot carry any of them. Nothing in this process
 * prints a row.
 *
 * **What is a failure, and what is merely drift.** The dump is taken at 23:30
 * and the drill reads production later, so the two are never identical and a
 * check demanding equality would cry wolf nightly:
 *
 *   * A table production has that the restore does **not** — a real failure.
 *     The archive could not rebuild the database.
 *   * A table with rows in production and **none** in the restore — a real
 *     failure, and the one that catches a dump silently losing a table.
 *   * Fewer rows in the restore than production — expected, since the dump is
 *     older. Reported, never failed.
 *   * **More** rows in the restore than production — reported loudly, because
 *     it means rows were deleted from production after the dump, and a silent
 *     deletion is the event this whole oversight exercise began from.
 *   * A table in the restore that production no longer has — a table dropped
 *     since the dump. Reported.
 */

/**
 * Platform noise a vanilla Postgres always produces restoring a Supabase dump.
 *
 * **The line is the schema, and it is drawn where it is on purpose.** `public`
 * is ours — every table this application reads or writes lives there, and an
 * error naming one is always a real failure. `auth`, `storage`, `realtime`,
 * `graphql`, `vault` and `extensions` belong to the Supabase platform: their
 * tables are created by Supabase's own migrations, not by anything in this
 * repository, and no plain Postgres can host them.
 *
 * That is not a loophole, it is the actual shape of a recovery. Restoring into
 * a fresh Supabase project would reload them; restoring into a bare server
 * cannot, and pretending otherwise would make this drill fail for ever on a
 * finding that is already understood and recorded (runbook section 20).
 *
 * The two column-level entries are narrower still and name the two tables
 * `scripts/pgliteSupabaseStubs.mjs` stubs — its `auth.users` and
 * `storage.buckets` have fewer columns than Supabase's real ones. A public
 * table losing a column is **not** covered by them, and would be caught twice
 * over: by this classification, and by the row count of the table whose COPY
 * failed coming back zero.
 */
const PLATFORM_SCHEMAS = "auth|storage|realtime|graphql|graphql_public|vault|extensions|net|cron|pgbouncer";
const TOLERATED = [
  /role "(supabase|pgbouncer|dashboard_user|authenticator|anon|authenticated|service_role)[^"]*" does not exist/i,
  new RegExp(`schema "(${PLATFORM_SCHEMAS})" (already exists|does not exist)`, "i"),
  /extension "(pg_graphql|pg_net|pgsodium|supabase_vault|pg_cron|pgjwt|pg_stat_statements|pgaudit)" is not available/i,
  /must be owner of|permission denied to set role|no privileges could be revoked/i,
  /unrecognized configuration parameter/i,
  // Relations and sequences inside a platform schema, always schema-qualified
  // by `supabase db dump`.
  new RegExp(`relation "(${PLATFORM_SCHEMAS})\\.[^"]+" does not exist`, "i"),
  // The two stub tables, which exist but are narrower than Supabase's.
  /column "[^"]+" of relation "(users|buckets)" does not exist/i,
  // Logical replication and the pgaudit event triggers, neither of which a
  // plain Postgres has. Named exactly rather than by prefix.
  /publication "supabase_realtime" does not exist/i,
  /function public\.pgaudit_(ddl_command_end|sql_drop)\(\) does not exist/i,
];

/**
 * Splits psql's stderr into errors that say nothing about our backup and
 * errors that do.
 *
 * Tolerating by pattern rather than ignoring errors wholesale is the point: a
 * restore that silently swallowed `relation "reservations" does not exist`
 * would be the exact failure this drill exists to catch.
 */
export function classifyErrors(stderr) {
  const tolerated = [];
  const real = [];
  for (const line of String(stderr).split("\n")) {
    if (!/^(psql:)?.*\bERROR\b/i.test(line)) continue;
    (TOLERATED.some((pattern) => pattern.test(line)) ? tolerated : real).push(line.trim());
  }
  return { tolerated, real };
}

/**
 * @param {Record<string, number>} production
 * @param {Record<string, number>} restored
 */
export function compareCounts(production, restored) {
  const problems = [];
  const notes = [];

  const productionTables = Object.keys(production);
  if (productionTables.length === 0) {
    problems.push("production reported no tables at all — the comparison has nothing to stand on");
    return { ok: false, problems, notes, missing: [], emptied: [] };
  }

  const missing = productionTables.filter((t) => !(t in restored));
  if (missing.length) {
    problems.push(`${missing.length} table(s) in production are absent from the restore: ${missing.join(", ")}`);
  }

  const emptied = productionTables.filter((t) => t in restored && production[t] > 0 && restored[t] === 0);
  if (emptied.length) {
    problems.push(
      `${emptied.length} table(s) hold rows in production and none in the restore: ` +
        emptied.map((t) => `${t} (${production[t]} → 0)`).join(", ")
    );
  }

  const grew = productionTables.filter((t) => t in restored && restored[t] > production[t]);
  if (grew.length) {
    notes.push(
      "rows present in the restore and gone from production — deleted since the dump: " +
        grew.map((t) => `${t} (${production[t]} now, ${restored[t]} in the backup)`).join(", ")
    );
  }

  const dropped = Object.keys(restored).filter((t) => !(t in production));
  if (dropped.length) notes.push(`table(s) in the restore that production no longer has: ${dropped.join(", ")}`);

  // Excluding the emptied ones, which are already a problem above — reporting
  // `reservations (0/412)` twice reads like two separate findings.
  const behind = productionTables.filter(
    (t) => t in restored && restored[t] < production[t] && !emptied.includes(t)
  );
  if (behind.length) {
    notes.push(
      `${behind.length} table(s) are behind production, which is expected of an overnight dump: ` +
        behind.map((t) => `${t} (${restored[t]}/${production[t]})`).join(", ")
    );
  }

  return { ok: problems.length === 0, problems, notes, missing, emptied };
}

export function report({ comparison, errors, archive, production, restored }) {
  const lines = [`restored ${archive}`];
  lines.push(
    `  ${Object.keys(restored).length} table(s) restored, ${Object.keys(production).length} in production; ` +
      `${Object.values(restored).reduce((a, b) => a + b, 0)} rows restored against ` +
      `${Object.values(production).reduce((a, b) => a + b, 0)} live`
  );
  if (errors.tolerated.length) {
    lines.push(`  ${errors.tolerated.length} platform error(s) tolerated (Supabase roles and schemas a plain Postgres lacks)`);
  }
  for (const line of errors.real) lines.push(`  RESTORE ERROR: ${line}`);
  for (const note of comparison.notes) lines.push(`  note: ${note}`);
  for (const problem of comparison.problems) lines.push(`  PROBLEM: ${problem}`);
  const ok = comparison.ok && errors.real.length === 0;
  lines.push(ok ? "The archive restores to a usable copy of production." : "The archive did NOT restore usably.");
  return lines.join("\n");
}

const json = (path) => JSON.parse(readFileSync(path, "utf8"));

export function main(argv) {
  const [productionPath, restoredPath, stderrPath, archive = "the archive"] = argv;
  if (!productionPath || !restoredPath) {
    process.stderr.write("usage: restoreDrill.mjs <production-counts.json> <restored-counts.json> [psql-stderr] [archive]\n");
    return 2;
  }
  const production = json(productionPath);
  const restored = json(restoredPath);
  const errors = stderrPath ? classifyErrors(readFileSync(stderrPath, "utf8")) : { tolerated: [], real: [] };
  const comparison = compareCounts(production, restored);
  process.stdout.write(`${report({ comparison, errors, archive, production, restored })}\n`);
  return comparison.ok && errors.real.length === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("restoreDrill.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
