import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_COMPATIBILITY_STUBS } from "./pgliteSupabaseStubs.mjs";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const stagingSeedFile = join(process.cwd(), "supabase", "seeds", "staging.sql");

// Shared with the tests, so a migration cannot replay against one fixture and
// break against the other. See scripts/pgliteSupabaseStubs.mjs.
const supabaseCompatibilityStubs = SUPABASE_COMPATIBILITY_STUBS;

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error(`No migrations found in ${migrationsDirectory}`);
}

const database = new PGlite();

try {
  await database.exec(supabaseCompatibilityStubs);

  for (const [index, filename] of migrationFiles.entries()) {
    const migration = await readFile(join(migrationsDirectory, filename), "utf8");

    try {
      await database.exec(migration);
      console.log(`[${index + 1}/${migrationFiles.length}] ${filename}`);
    } catch (error) {
      console.error(`\nMigration replay failed at ${filename}.`);
      console.error(
        "PGlite compatibility stubs: roles anon/authenticated/service_role, storage.buckets, and the auth schema (auth.users, auth.uid). See scripts/pgliteSupabaseStubs.mjs."
      );
      throw error;
    }
  }

  const legacyNameColumn = await database.query(
    `select data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = 'name'`
  );
  const legacyNameTrigger = await database.query(
    `select tgname
       from pg_trigger
      where tgrelid = 'public.customers'::regclass
        and not tgisinternal
        and tgname = 'customers_sync_legacy_name_trg'`
  );

  const column = legacyNameColumn.rows[0];
  if (
    legacyNameColumn.rows.length !== 1 ||
    column.data_type !== "text" ||
    column.is_nullable !== "YES"
  ) {
    throw new Error(
      "Migration replay produced the wrong customers.name compatibility column"
    );
  }
  if (legacyNameTrigger.rows.length !== 1) {
    throw new Error(
      "Migration replay did not attach customers_sync_legacy_name_trg"
    );
  }

  // The hosted reset command runs this seed after every replay. Apply it twice
  // here: one pass proves it fits the replayed schema; the second proves it is
  // genuinely idempotent rather than merely documented as such.
  const stagingSeed = await readFile(stagingSeedFile, "utf8");
  await database.exec(stagingSeed);
  await database.exec(stagingSeed);
  const seedCounts = await database.query(`
    select
      (select count(*)::int from vehicles where name like 'STAGING %') as vehicles,
      (select count(*)::int from customers where email like '%@example.invalid') as customers,
      (select count(*)::int from reservations where notes like 'Synthetic %') as reservations,
      (select count(*)::int from vehicle_damages where repaired_on is null) as open_damages,
      (select count(*)::int from storage.buckets where id = 'reservation-documents') as buckets
  `);
  const counts = seedCounts.rows[0];
  if (
    counts.vehicles !== 29 ||
    counts.customers !== 5 ||
    counts.reservations !== 6 ||
    counts.open_damages < 1 ||
    counts.buckets !== 1
  ) {
    throw new Error(`Staging seed produced unexpected fixture counts: ${JSON.stringify(counts)}`);
  }

  console.log(`\nMigration replay passed: ${migrationFiles.length} migrations applied in filename order.`);
  console.log("Verified customers.name is nullable text with its compatibility trigger attached.");
  console.log("Verified the synthetic staging seed is idempotent: 29 vehicles, 5 customers, 6 reservations, an open damage and the private documents bucket.");
  console.log(
    "PGlite compatibility stubs: roles anon/authenticated/service_role, storage.buckets, and the auth schema (auth.users, auth.uid). See scripts/pgliteSupabaseStubs.mjs."
  );
} finally {
  await database.close();
}
