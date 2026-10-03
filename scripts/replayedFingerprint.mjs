import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_COMPATIBILITY_STUBS } from "./pgliteSupabaseStubs.mjs";

/**
 * The **expected** fingerprint: every migration replayed into a throwaway
 * Postgres, then the same catalog query production will answer.
 *
 * Deliberately not a committed baseline file. A baseline has to be refreshed by
 * hand after every legitimate change, and a file refreshed by hand becomes a
 * file recording whatever production looked like the last time somebody
 * remembered — the staleness `DEFINING-STATEMENTS.md` §11 says must announce
 * itself. The migrations are already the reviewed source of truth for what
 * production should be, and they are current by construction.
 *
 * It reuses the stubs and the replay order of
 * `scripts/check-migration-replay.mjs` rather than re-implementing them (§9), so
 * a migration cannot pass the preflight and be fingerprinted differently.
 *
 * @param {(database: import("@electric-sql/pglite").PGlite, info: { migrations: number }) => Promise<any>} run
 * @param {{ root?: string, seed?: string | null }} [options]
 */
export async function withReplayedDatabase(run, { root = process.cwd(), seed = null } = {}) {
  const directory = join(root, "supabase", "migrations");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`no migrations in ${directory}`);

  const database = new PGlite();
  try {
    await database.exec(SUPABASE_COMPATIBILITY_STUBS);
    for (const file of files) {
      try {
        await database.exec(await readFile(join(directory, file), "utf8"));
      } catch (error) {
        throw new Error(`migration replay failed at ${file}: ${error.message}`);
      }
    }
    if (seed) await database.exec(seed);
    return await run(database, { migrations: files.length });
  } finally {
    await database.close();
  }
}

/**
 * Runs one of the `scripts/sql/*.sql` files and parses its single JSON column.
 *
 * @param {import("@electric-sql/pglite").PGlite} database
 * @param {string} path
 * @param {{ root?: string }} [options]
 * @returns {Promise<any>}
 */
export async function queryJson(database, path, { root = process.cwd() } = {}) {
  const sql = await readFile(join(root, path), "utf8");
  const result = await database.query(sql);
  const row = result.rows[0] ?? {};
  const column = Object.keys(row)[0];
  return JSON.parse(row[column]);
}

export async function replayedFingerprint(options = {}) {
  return withReplayedDatabase(
    async (database, { migrations }) => ({
      fingerprint: await queryJson(database, "scripts/sql/production-fingerprint.sql", options),
      migrations,
    }),
    options,
  );
}
