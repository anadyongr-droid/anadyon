#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

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

function canonical(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) =>
      line.trim() &&
      !line.startsWith("--") &&
      !line.startsWith("SET ") &&
      !line.startsWith("SELECT pg_catalog.set_config") &&
      !line.startsWith("\\restrict") &&
      !line.startsWith("\\unrestrict"),
    )
    .join("\n");
}

const prodSchema = canonical(productionFile);
const stageSchema = canonical(stagingFile);
const digest = (value) => createHash("sha256").update(value).digest("hex");

if (prodSchema === stageSchema) {
  console.log(`Schema parity passed in both directions (${digest(prodSchema)}).`);
  console.log(`Read-only dumps retained at ${output}`);
  process.exit(0);
}

const prodLines = new Set(prodSchema.split("\n"));
const stageLines = new Set(stageSchema.split("\n"));
const onlyProduction = [...prodLines].filter((line) => !stageLines.has(line));
const onlyStaging = [...stageLines].filter((line) => !prodLines.has(line));

console.error("Schema parity failed.");
console.error(`Only in production (${onlyProduction.length} lines):`);
for (const line of onlyProduction.slice(0, 80)) console.error(`  - ${line}`);
console.error(`Only in staging (${onlyStaging.length} lines):`);
for (const line of onlyStaging.slice(0, 80)) console.error(`  + ${line}`);
console.error(`Full read-only dumps retained at ${output}`);
process.exit(1);
