import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

const supabaseCompatibilityStubs = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    owner uuid,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

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
        "PGlite compatibility stubs: roles anon/authenticated/service_role and storage.buckets."
      );
      throw error;
    }
  }

  console.log(`\nMigration replay passed: ${migrationFiles.length} migrations applied in filename order.`);
  console.log(
    "PGlite compatibility stubs: roles anon/authenticated/service_role and storage.buckets."
  );
} finally {
  await database.close();
}
