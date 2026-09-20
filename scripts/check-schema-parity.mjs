#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalDump, classifySchemaDifference } from "./schema-parity-lib.mjs";

const production = process.env.PRODUCTION_SUPABASE_DB_URL?.trim();
const staging = process.env.STAGING_SUPABASE_DB_URL?.trim();
if (!production || !staging) {
  throw new Error("PRODUCTION_SUPABASE_DB_URL and STAGING_SUPABASE_DB_URL are required");
}
if (production === staging) {
  throw new Error("Refusing parity check: production and staging database URLs are identical");
}

const root = join(import.meta.dirname, "..");
const cli = join(root, "node_modules", ".bin", "supabase");
const output = mkdtempSync(join(tmpdir(), "anadyon-schema-parity-"));
const productionFile = join(output, "production-public.sql");
const stagingFile = join(output, "staging-public.sql");

for (const [url, file] of [[production, productionFile], [staging, stagingFile]]) {
  execFileSync(cli, ["db", "dump", "--db-url", url, "--schema", "public", "--file", file], {
    cwd: root,
    stdio: "inherit",
  });
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
