#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseEnvFile, validateStagingTarget } from "./staging-safety.mjs";
import { seedStagingAuth } from "./seed-staging-auth.mjs";

const root = join(import.meta.dirname, "..");
const stagingFile = parseEnvFile(join(root, ".env.staging.local"));
const productionFile = parseEnvFile(join(root, ".env.local"));
const env = {
  ...stagingFile,
  ...process.env,
  // Never allow a persistent env file to acknowledge a destructive reset.
  CONFIRM_STAGING_RESET: process.env.CONFIRM_STAGING_RESET,
};
const target = validateStagingTarget(env, productionFile);
const cli = join(root, "node_modules", ".bin", "supabase");

if (!existsSync(cli)) {
  throw new Error("Supabase CLI is missing. Run npm ci before resetting staging.");
}

console.log(`Reset target verified three ways: ${target.ref} (${target.apiUrl}).`);
console.log("This command drops the hosted STAGING database, replays every migration, and loads synthetic fixtures.");

try {
  execFileSync(cli, [
    "db",
    "reset",
    "--db-url",
    target.dbUrl,
    "--sql-paths",
    "seeds/staging.sql",
    "--yes",
  ], { cwd: root, stdio: "inherit" });
} catch {
  throw new Error("The hosted staging reset failed; database credentials were redacted from this error");
}

await seedStagingAuth(env);

const db = createClient(target.apiUrl, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const checks = await Promise.all([
  db.from("vehicles").select("id", { count: "exact", head: true }).like("name", "STAGING %"),
  db.from("customers").select("id", { count: "exact", head: true }).like("email", "%@example.invalid"),
  db.from("reservations").select("id", { count: "exact", head: true }).like("notes", "Synthetic %"),
  db.storage.listBuckets(),
]);
for (const result of checks) {
  if (result.error) throw result.error;
}
const bucketExists = checks[3].data?.some((bucket) => bucket.id === "reservation-documents");
if (checks[0].count !== 29 || checks[1].count !== 5 || checks[2].count !== 6 || !bucketExists) {
  throw new Error("Staging verification counts or reservation-documents bucket did not match the seed");
}

execFileSync(process.execPath, [join(root, "scripts", "check-grants.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  },
});

execFileSync(process.execPath, [join(root, "scripts", "check-schema-drift.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  },
});

console.log("Staging reset verified: fixtures, auth roles, schema, least privilege and private document bucket are present.");
console.log("Enrol TOTP for both synthetic users on first login; MFA remains deliberately mandatory.");
