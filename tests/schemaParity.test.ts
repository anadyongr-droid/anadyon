import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalDump,
  classifySchemaDifference,
  redactDatabaseCredentials,
  REDACTED_DATABASE_PASSWORD,
  schemaDumpFailureMessage,
  splitSqlStatements,
} from "../scripts/schema-parity-lib.mjs";

const manifest = {
  pendingMigrations: [
    {
      id: "042",
      required: true,
      stagingOnlyStatementPatterns: ["\\bFUNCTION public\\.finalise_check_in(?:_impl)?\\b"],
    },
    { id: "044", required: false, schemaEffect: "none — data only" },
  ],
};

describe("schema parity expected-difference classifier", () => {
  it("keeps a dollar-quoted function body together as one statement", () => {
    const sql = `CREATE FUNCTION public.finalise_check_in_impl() RETURNS void
LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM public.some_call();
  RAISE NOTICE 'semi;colon';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.finalise_check_in_impl() TO service_role;`;

    expect(splitSqlStatements(sql)).toHaveLength(2);
  });

  it("accepts only the declared staging-only function", () => {
    const production = "CREATE TABLE public.reservations (id uuid);";
    const staging = `${production}\nCREATE FUNCTION public.finalise_check_in_impl() RETURNS void LANGUAGE sql AS $$ SELECT; $$;`;
    const result = classifySchemaDifference(production, staging, manifest);

    expect(result.ok).toBe(true);
    expect(result.expectedStaging).toHaveLength(1);
    expect(result.missingRequired).toEqual([]);
  });

  it("fails on an unrelated staging object even when the pending function is present", () => {
    const production = "CREATE TABLE public.reservations (id uuid);";
    const staging = `${production}
CREATE FUNCTION public.finalise_check_in_impl() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
CREATE TABLE public.unreviewed_table (id uuid);`;
    const result = classifySchemaDifference(production, staging, manifest);

    expect(result.ok).toBe(false);
    expect(result.unexpectedStaging).toEqual(["CREATE TABLE public.unreviewed_table (id uuid)"]);
  });

  it("fails on every production-only difference", () => {
    const production = "CREATE TABLE public.production_only (id uuid);";
    const staging = "CREATE FUNCTION public.finalise_check_in_impl() RETURNS void LANGUAGE sql AS $$ SELECT; $$;";
    const result = classifySchemaDifference(production, staging, manifest);

    expect(result.ok).toBe(false);
    expect(result.onlyProduction).toEqual(["CREATE TABLE public.production_only (id uuid)"]);
  });

  it("fails when a required pending migration has no observable schema effect", () => {
    const same = "CREATE TABLE public.reservations (id uuid);";
    const result = classifySchemaDifference(same, same, manifest);

    expect(result.ok).toBe(false);
    expect(result.missingRequired).toEqual(["042"]);
  });

  it("ignores dump boilerplate without erasing SQL inside functions", () => {
    const sql = `-- dump header
SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.finalise_check_in_impl() RETURNS text AS $$
  SELECT '-- retained';
$$ LANGUAGE sql;`;

    const canonical = canonicalDump(sql);
    expect(canonical).not.toContain("statement_timeout");
    expect(canonical).toContain("SELECT '-- retained'");
  });

  it("accepts exactly the repository's declared 042–045 boundary", () => {
    const repositoryManifest = JSON.parse(
      readFileSync(join(process.cwd(), "scripts/schema-parity-pending.json"), "utf8"),
    );
    const common = "CREATE TABLE public.reservations (id uuid);";
    const staging = `${common}
CREATE FUNCTION public.finalise_check_in_impl() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
COMMENT ON FUNCTION public.finalise_check_in_impl() IS 'check-in';
CREATE FUNCTION public.correct_handover_impl() RETURNS void LANGUAGE sql AS $$ SELECT; $$;
ALTER FUNCTION public.void_handover(uuid, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.finalise_check_out(uuid, timestamp with time zone) TO authenticated;`;
    const result = classifySchemaDifference(common, staging, repositoryManifest);

    expect(result.ok).toBe(true);
    expect(new Set(result.expectedStaging.map(({ migration }) => migration))).toEqual(
      new Set(["042", "043", "045"]),
    );
  });
});

describe("schema parity credential safety", () => {
  const databaseUrl =
    "postgresql://postgres.project-ref:password-with-%40@pooler.example.com:5432/postgres";

  it("redacts a known database URL from child-process diagnostics", () => {
    const diagnostic = `Command failed: supabase db dump --db-url ${databaseUrl}`;
    const redacted = redactDatabaseCredentials(diagnostic, [databaseUrl]);

    expect(redacted).not.toContain(databaseUrl);
    expect(redacted).not.toContain("password-with-%40");
    expect(redacted).toContain("[REDACTED_DATABASE_URL]");
  });

  it("redacts PostgreSQL URLs even when they were not supplied separately", () => {
    const redacted = redactDatabaseCredentials(`unexpected ${databaseUrl}`, []);

    expect(redacted).not.toContain("password-with-%40");
    expect(redacted).toBe("unexpected [REDACTED_DATABASE_URL]");
  });

  it("redacts credential URLs even when the scheme is malformed", () => {
    const malformed =
      "postpostgresql://postgres.project:do-not-print@pooler.example.com:5432/postgres";
    const redacted = redactDatabaseCredentials(`failed to parse ${malformed}`);

    expect(redacted).toBe("failed to parse [REDACTED_DATABASE_URL]");
    expect(redacted).not.toContain("do-not-print");
    expect(redacted).not.toContain("pooler.example.com");
  });

  // The password on its own, detached from the URL it came in.
  //
  // Whole-URL replacement covers the string as passed; the URL-shaped patterns
  // cover anything that still looks like a URL. Neither sees the password once
  // it is separated from its URL — and that is the part worth protecting.
  // Found by running the redactor against output shapes these tools actually
  // produce, after #142 landed.
  it("redacts the password when it appears outside a URL", () => {
    const url =
      "postgresql://postgres.project:S3cr3tP%40ss@pooler.example.com:5432/postgres";

    // libpq keyword form. A driver reporting a connection string this way
    // produces no URL for a URL-shaped pattern to match.
    const keyword = redactDatabaseCredentials(
      "connection failed: host=db.example.com user=postgres password=S3cr3tP@ss",
      [url],
    );
    expect(keyword).not.toContain("S3cr3tP@ss");
    expect(keyword).toContain(REDACTED_DATABASE_PASSWORD);

    // Percent-decoded, because the URL carries %40 where the driver prints @.
    expect(keyword).not.toContain("S3cr3t");

    // And the raw form, as it appears inside the URL.
    const raw = redactDatabaseCredentials("tried S3cr3tP%40ss", [url]);
    expect(raw).not.toContain("S3cr3tP%40ss");
    expect(raw).toContain(REDACTED_DATABASE_PASSWORD);
  });

  // The floor exists so a password that reads like a word cannot blank
  // unrelated text. Asserted rather than assumed, because a redactor that
  // rewrites ordinary log lines gets turned off.
  it("leaves a very short password alone rather than scrubbing common words", () => {
    const url = "postgresql://postgres:abc@pooler.example.com:5432/postgres";
    const out = redactDatabaseCredentials("abc appears in ordinary text", [url]);
    expect(out).toBe("abc appears in ordinary text");
  });

  it("reports a labelled dump failure without reproducing command arguments", () => {
    const message = schemaDumpFailureMessage(
      "production",
      {
        status: 1,
        stdout: "Dumping schemas from remote database...",
        stderr: `failed command --db-url ${databaseUrl}`,
        error: new Error(`Command failed with ${databaseUrl}`),
      },
      [databaseUrl],
    );

    expect(message).toContain("production schema dump failed");
    expect(message).not.toContain(databaseUrl);
    expect(message).not.toContain("password-with-%40");
    expect(message).toContain("[REDACTED_DATABASE_URL]");
  });

  it("checks Docker before the executable script reads database URLs", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/check-schema-parity.mjs"),
      "utf8",
    );

    expect(source.indexOf("ensureSchemaDumpPrerequisites"))
      .toBeLessThan(source.indexOf("PRODUCTION_SUPABASE_DB_URL"));
  });
});
