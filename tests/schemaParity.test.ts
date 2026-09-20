import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalDump,
  classifySchemaDifference,
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
