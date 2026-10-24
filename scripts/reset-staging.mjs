#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseEnvFile, validateStagingTarget } from "./staging-safety.mjs";
import { seedStagingAuth } from "./seed-staging-auth.mjs";
import { redactDatabaseCredentials, schemaDumpFailureMessage } from "./schema-parity-lib.mjs";
import { stagingSeedProblems, stagingSeedSummary } from "./stagingSeedFixtures.mjs";

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

const reset = spawnSync(cli, [
    "db",
    "reset",
    "--db-url",
    target.dbUrl,
    "--sql-paths",
    "seeds/staging.sql",
    "--yes",
  ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
if (reset.error || reset.status !== 0) {
  throw new Error(schemaDumpFailureMessage("hosted staging reset", reset, [target.dbUrl]));
}
const resetProgress = redactDatabaseCredentials(
  [reset.stdout, reset.stderr].filter(Boolean).join("\n"),
  [target.dbUrl],
).trim();
if (resetProgress) {
  console.log(resetProgress);
}

await seedStagingAuth(env);

const db = createClient(target.apiUrl, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// `rates` and `extras_config` are counted here as well as the fixtures, and
// that is the point of this block rather than a tidy-up. They are the two
// tables DEFINING-STATEMENTS.md §6 grants to `anon`, because the public
// booking form cannot price a rental without them -- so a reset that loaded
// no rates leaves staging showing a fleet it cannot quote for, and until
// 24 October this check would have called that a success. The expectations
// live in scripts/stagingSeedFixtures.mjs so this and the credential-free
// replay check cannot drift apart.
const checks = await Promise.all([
  db.from("vehicles").select("id", { count: "exact", head: true }).like("name", "STAGING %"),
  db.from("customers").select("id", { count: "exact", head: true }).like("email", "%@example.invalid"),
  db.from("reservations").select("id", { count: "exact", head: true }).like("notes", "Synthetic %"),
  db.storage.listBuckets(),
  db.from("rates").select("id", { count: "exact", head: true }),
  db.from("extras_config").select("key", { count: "exact", head: true }),
]);
for (const result of checks) {
  if (result.error) throw result.error;
}
const seedProblems = stagingSeedProblems({
  vehicles: checks[0].count ?? undefined,
  customers: checks[1].count ?? undefined,
  reservations: checks[2].count ?? undefined,
  rates: checks[4].count ?? undefined,
  extras: checks[5].count ?? undefined,
  bucket: Boolean(checks[3].data?.some((bucket) => bucket.id === "reservation-documents")),
});
if (seedProblems.length) {
  throw new Error(`Staging reset did not produce the expected state:\n  ${seedProblems.join("\n  ")}`);
}
console.log(`Staging state verified: ${stagingSeedSummary()}.`);

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
