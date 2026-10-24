#!/usr/bin/env node
import { SUPABASE_COMPATIBILITY_STUBS } from "./pgliteSupabaseStubs.mjs";

/**
 * Prints the Supabase compatibility stubs as SQL, for a psql-driven consumer.
 *
 * The restore drill needs the same roles and schemas the migration replay
 * needs, and `scripts/pgliteSupabaseStubs.mjs` says in its own header why
 * there must be exactly one copy: "a check that passes against a fixture the
 * real gate does not have" is a failure this project has already paid for
 * twice. So the drill imports them rather than restating them, and this file
 * exists only to get a JavaScript string to a shell.
 */
process.stdout.write(`${SUPABASE_COMPATIBILITY_STUBS}\n`);
