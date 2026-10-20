import { describe, expect, it } from "vitest";
import { classifyErrors, compareCounts, report } from "../scripts/restoreDrill.mjs";

/**
 * Whether a stored archive restores to a usable copy of production.
 *
 * **The gap this closes.** Before 20 October 2026 nothing had ever opened an
 * archive that came back out of R2. The nightly job decrypts the file it has
 * just made, in memory; the inventory check lists the bucket. Thirty
 * undecryptable objects pass both. That was E23, and it sat open because it
 * was filed as a person's errand.
 *
 * The cases below are the ones that decide whether this drill is worth
 * running: it must distinguish an overnight dump being slightly behind, which
 * is normal every single night, from a dump that lost a table, which is the
 * disaster it exists to catch. A check that confuses the two is worse than
 * none, because somebody will switch it off.
 */

const PRODUCTION = { reservations: 412, quotes: 19, vehicles: 31, rates: 44, alert_outbox: 100 };

describe("an overnight dump is behind production, and that is not a fault", () => {
  it("passes when every table is present and merely a few rows short", () => {
    const result = compareCounts(PRODUCTION, { ...PRODUCTION, reservations: 410, quotes: 18 });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.notes.join(" ")).toContain("expected of an overnight dump");
  });

  it("passes when the counts match exactly", () => {
    expect(compareCounts(PRODUCTION, { ...PRODUCTION }).ok).toBe(true);
  });

  it("does not mind an empty table that is also empty in production", () => {
    const production = { ...PRODUCTION, promo_codes: 0 };
    expect(compareCounts(production, { ...production }).ok).toBe(true);
  });
});

describe("the failures it exists to catch", () => {
  it("fails when a table production has is missing from the restore", () => {
    const { reservations, ...withoutReservations } = { ...PRODUCTION };
    void reservations;
    const result = compareCounts(PRODUCTION, withoutReservations);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["reservations"]);
    expect(result.problems.join(" ")).toContain("absent from the restore");
  });

  it("fails when a table restores empty although production has rows", () => {
    // The dump that silently stopped including a table. Every other check in
    // this project passes in that case: the archive is present, the right
    // size and decrypts.
    const result = compareCounts(PRODUCTION, { ...PRODUCTION, reservations: 0 });
    expect(result.ok).toBe(false);
    expect(result.emptied).toEqual(["reservations"]);
    expect(result.problems.join(" ")).toContain("412 → 0");
  });

  it("does not report an emptied table twice", () => {
    // It is one finding, not a missing-rows note and a problem.
    const result = compareCounts(PRODUCTION, { ...PRODUCTION, reservations: 0 });
    expect(result.notes.join(" ")).not.toContain("reservations");
  });

  it("refuses to pass when production reported nothing", () => {
    // Comparing against an empty object would otherwise make every restore
    // look perfect, which is the quiet way a comparison dies.
    const result = compareCounts({}, { reservations: 412 });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("nothing to stand on");
  });
});

describe("rows that exist in the backup and not in production", () => {
  it("is reported loudly, because a silent deletion is the thing we fear", () => {
    const result = compareCounts(PRODUCTION, { ...PRODUCTION, reservations: 500 });
    expect(result.ok).toBe(true); // the archive is fine; production is the question
    expect(result.notes.join(" ")).toContain("deleted since the dump");
  });

  it("mentions a table dropped from production since the dump", () => {
    const result = compareCounts(PRODUCTION, { ...PRODUCTION, old_table: 5 });
    expect(result.notes.join(" ")).toContain("old_table");
  });
});

describe("telling platform noise from a real restore failure", () => {
  it("tolerates the Supabase roles and schemas a plain Postgres has never heard of", () => {
    const stderr = [
      'psql:schema.sql:12: ERROR:  role "supabase_admin" does not exist',
      'psql:schema.sql:30: ERROR:  schema "graphql" does not exist',
      'psql:roles.sql:4: ERROR:  must be owner of role anon',
    ].join("\n");
    const { tolerated, real } = classifyErrors(stderr);
    expect(real).toEqual([]);
    expect(tolerated).toHaveLength(3);
  });

  it("does NOT tolerate a missing table of ours", () => {
    // Tolerating by pattern rather than ignoring errors wholesale is the whole
    // point: this line is the failure the drill exists to surface.
    const stderr = 'psql:data.sql:88: ERROR:  relation "public.reservations" does not exist';
    const { tolerated, real } = classifyErrors(stderr);
    expect(tolerated).toEqual([]);
    expect(real).toHaveLength(1);
  });

  it("tolerates the platform schemas a plain Postgres cannot host", () => {
    // Every one of these is from the first real run, 20 October 2026
    // (39407010918). `auth` and `storage` are created by Supabase's own
    // migrations, not by anything in this repository, so a bare server has
    // nowhere to put them — the actual shape of a restore, recorded in
    // runbook section 20 rather than hidden.
    const stderr = [
      'psql:restored/data.sql:365: ERROR:  relation "auth.sso_providers" does not exist',
      'psql:restored/data.sql:2429: ERROR:  relation "storage.objects" does not exist',
      'psql:restored/data.sql:2461: ERROR:  relation "auth.refresh_tokens_id_seq" does not exist',
      'psql:restored/schema.sql:3560: ERROR:  publication "supabase_realtime" does not exist',
      'psql:restored/schema.sql:3814: ERROR:  function public.pgaudit_ddl_command_end() does not exist',
      'psql:restored/data.sql:52: ERROR:  column "instance_id" of relation "users" does not exist',
      'psql:restored/data.sql:2403: ERROR:  column "avif_autodetection" of relation "buckets" does not exist',
    ].join("\n");
    const { real } = classifyErrors(stderr);
    expect(real).toEqual([]);
  });

  it("still fails on anything in public, which is the whole point of drawing the line there", () => {
    // If this ever passes, the classification has become "tolerate
    // everything" and the drill is decoration.
    const stderr = [
      'psql:restored/data.sql:99: ERROR:  relation "public.reservations" does not exist',
      'psql:restored/data.sql:120: ERROR:  column "total" of relation "quotes" does not exist',
    ].join("\n");
    const { real, tolerated } = classifyErrors(stderr);
    expect(tolerated).toEqual([]);
    expect(real).toHaveLength(2);
  });

  it("does not let a public table borrow the stub tables' exemption", () => {
    // The column exemption names `users` and `buckets` because those are the
    // two tables the shared stubs create narrower than Supabase's. A public
    // table losing a column must not ride along on it.
    const stderr = 'psql:restored/data.sql:7: ERROR:  column "plate" of relation "vehicles" does not exist';
    expect(classifyErrors(stderr).real).toHaveLength(1);
  });

  it("does not mistake a warning or a notice for an error", () => {
    const stderr = ["NOTICE:  table does not exist, skipping", "WARNING:  no privileges"].join("\n");
    expect(classifyErrors(stderr)).toEqual({ tolerated: [], real: [] });
  });
});

describe("the report a person reads", () => {
  it("says plainly that it worked, and counts nothing but cardinalities", () => {
    const restored = { ...PRODUCTION, reservations: 410 };
    const text = report({
      comparison: compareCounts(PRODUCTION, restored),
      errors: { tolerated: ["x"], real: [] },
      archive: "anadyon-2026-10-20T01-58-16Z.tar.gz.enc",
      production: PRODUCTION,
      restored,
    });
    expect(text).toContain("restores to a usable copy of production");
    expect(text).toContain("1 platform error(s) tolerated");
  });

  it("says plainly that it did not", () => {
    const restored = { ...PRODUCTION, reservations: 0 };
    const text = report({
      comparison: compareCounts(PRODUCTION, restored),
      errors: { tolerated: [], real: ['ERROR:  relation "x" does not exist'] },
      archive: "a.enc",
      production: PRODUCTION,
      restored,
    });
    expect(text).toContain("did NOT restore usably");
    expect(text).toContain("RESTORE ERROR");
  });
});
