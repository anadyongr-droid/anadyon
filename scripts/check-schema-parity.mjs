#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  canonicalDump,
  classifySchemaDifference,
  redactDatabaseCredentials,
  schemaDumpFailureMessage,
} from "./schema-parity-lib.mjs";

const root = join(import.meta.dirname, "..");
const cli = join(root, "node_modules", ".bin", "supabase");

function ensureSchemaDumpPrerequisites() {
  if (!existsSync(cli)) {
    throw new Error("Schema parity prerequisites are missing. Run npm ci first.");
  }

  // Supabase CLI runs pg_dump in Docker. Check this before reading credentials
  // so a missing CLI/daemon can never put a database URL on a failing argv.
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.error || docker.status !== 0) {
    throw new Error(
      "Schema parity requires a running Docker Desktop. Start Docker and retry; no database connection was attempted.",
    );
  }
}

try {
  ensureSchemaDumpPrerequisites();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Schema parity prerequisites are unavailable.");
  process.exit(1);
}

const production = process.env.PRODUCTION_SUPABASE_DB_URL?.trim();
const staging = process.env.STAGING_SUPABASE_DB_URL?.trim();
if (!production || !staging) {
  throw new Error("PRODUCTION_SUPABASE_DB_URL and STAGING_SUPABASE_DB_URL are required");
}
if (production === staging) {
  throw new Error("Refusing parity check: production and staging database URLs are identical");
}

const output = mkdtempSync(join(tmpdir(), "anadyon-schema-parity-"));
const productionFile = join(output, "production-public.sql");
const stagingFile = join(output, "staging-public.sql");

for (const [label, url, file] of [
  ["production", production, productionFile],
  ["staging", staging, stagingFile],
]) {
  const result = spawnSync(
    cli,
    ["db", "dump", "--db-url", url, "--schema", "public", "--file", file],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (result.error || result.status !== 0) {
    console.error(schemaDumpFailureMessage(label, result, [production, staging]));
    process.exit(1);
  }
  const progress = redactDatabaseCredentials(
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
    [production, staging],
  ).trim();
  if (progress) console.log(progress);
}

const prodRaw = readFileSync(productionFile, "utf8");
const stageRaw = readFileSync(stagingFile, "utf8");
const prodSchema = canonicalDump(prodRaw);
const stageSchema = canonicalDump(stageRaw);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const manifest = JSON.parse(
  readFileSync(join(root, "scripts", "schema-parity-pending.json"), "utf8"),
);
const result = classifySchemaDifference(prodRaw, stageRaw, manifest);

if (prodSchema === stageSchema && result.ok) {
  console.log(`Schema parity passed in both directions (${digest(prodSchema)}).`);
  console.log(`Read-only dumps retained at ${output}`);
  process.exit(0);
}

if (result.ok) {
  const migrations = [...new Set(result.expectedStaging.map(({ migration }) => migration))];
  console.log(
    `Schema parity passed with declared staging-only migrations ${migrations.join(", ")}. ` +
    `Classified ${result.expectedStaging.length} complete SQL statement(s); no unexplained drift.`,
  );
  console.log(`Read-only dumps retained at ${output}`);
  process.exit(0);
}

console.error(
  "Schema parity failed: the live difference is not exactly the declared pending-migration boundary.",
);
console.error(`Only in production (${result.onlyProduction.length} statements):`);
for (const statement of result.onlyProduction.slice(0, 20)) {
  console.error(`  - ${statement.slice(0, 500)}`);
}
console.error(`Unexplained only in staging (${result.unexpectedStaging.length} statements):`);
for (const statement of result.unexpectedStaging.slice(0, 20)) {
  console.error(`  + ${statement.slice(0, 500)}`);
}
if (result.missingRequired.length) {
  console.error(`Declared migrations with no matching schema effect: ${result.missingRequired.join(", ")}`);
}
console.error(`Expected staging-only statements classified: ${result.expectedStaging.length}`);
console.error(`Full read-only dumps retained at ${output}`);
process.exit(1);
