#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  describeDatabaseUrlShape,
  redactDatabaseCredentials,
  schemaDumpFailureMessage,
} from "./schema-parity-lib.mjs";

const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("SUPABASE_DB_URL is required for the backup.");
  process.exit(1);
}

const dumps = [
  ["roles", ["--role-only"], "dump/roles.sql"],
  ["schema", [], "dump/schema.sql"],
  ["data", ["--data-only", "--use-copy"], "dump/data.sql"],
];

for (const [label, flags, file] of dumps) {
  const result = spawnSync(
    "supabase",
    ["db", "dump", "--db-url", url, "-f", file, ...flags],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    console.error(schemaDumpFailureMessage(`${label} backup`, result, [url]));
    // The failure message is redacted, which is right and also leaves nobody
    // able to see what was wrong with the value. This says what shape it has
    // without revealing any of it, so a bad secret is diagnosed from the run
    // rather than guessed at.
    console.error("\nSUPABASE_DB_URL shape (no part of the value is shown):");
    console.error(describeDatabaseUrlShape(process.env.SUPABASE_DB_URL).join("\n"));
    process.exit(1);
  }
  const progress = redactDatabaseCredentials(
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
    [url],
  ).trim();
  if (progress) console.log(progress);
}
