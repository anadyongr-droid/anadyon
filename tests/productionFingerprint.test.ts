import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DELIBERATELY_PUBLIC_TABLES,
  compareCounts,
  diffFingerprints,
  digest,
  explainWith,
  normaliseFingerprint,
  renderReport,
  worstSeverity,
} from "../scripts/productionFingerprint.mjs";
import { queryJson, withReplayedDatabase } from "../scripts/replayedFingerprint.mjs";

/**
 * The nightly production check: does it *discriminate*, and can it leak?
 *
 * Two halves, and the second is the one no amount of fixture testing could give.
 *
 * **The comparison** is tested against hand-built fingerprints, because the
 * cases that matter — an `anon` grant appearing, RLS switched off, a table
 * nobody declared, rows disappearing — must not wait for production to produce
 * them. Each is asserted against a case that must fire and a case that must not,
 * for the reason the marker's own test states: a check exercised only on the
 * happy path reports clean and gets believed.
 *
 * **The SQL** is exercised against a real Postgres with all the project's
 * migrations replayed, because a catalog query is where this build's risk
 * actually sits: a column that does not exist in the catalog, a `jsonb` function
 * PGlite lacks, a join that silently returns nothing. A fingerprint that comes
 * back `{}` would make every comparison pass. Those tests assert it is
 * *substantial*, not merely parseable.
 *
 * **And one privacy test that is not optional.** This repository is public and
 * production holds customers' dates of birth, addresses and phone numbers. The
 * fingerprint is carried out of production nightly, so a query that could pick
 * up a value would be a data leak on a cron schedule. The test seeds a
 * recognisable value and fails if it appears anywhere in the output.
 */

/**
 * A minimal fingerprint, in the shape the SQL produces.
 *
 * Typed loosely on purpose: every case below mutates one field of a copy to
 * stand for a database that drifted, and a narrowly inferred literal type would
 * reject `grants.anon = [...]` — the single most important case in the file.
 */
type TableFingerprint = {
  rls_enabled: boolean;
  rls_forced: boolean;
  columns: Record<string, string>;
  grants: Record<string, string[]>;
  policies: Record<string, unknown>;
  triggers: string[];
  indexes: string[];
};
type Fingerprint = {
  tables: Record<string, TableFingerprint>;
  views: Record<string, unknown>;
  functions: Record<string, { security_definer: boolean; returns: string }>;
  extensions: Record<string, string>;
};

const table = (over: Partial<TableFingerprint> = {}): TableFingerprint => ({
  rls_enabled: true,
  rls_forced: false,
  columns: { id: "uuid not null" },
  grants: { service_role: ["SELECT"], postgres: ["SELECT"] },
  policies: {},
  triggers: [],
  indexes: [],
  ...over,
});

const base: Fingerprint = {
  tables: { reservations: table(), rates: table({ grants: { anon: ["SELECT"], service_role: ["SELECT"] } }) },
  views: {},
  functions: {},
  extensions: { plpgsql: "1.0" },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("the comparison fires on what matters", () => {
  it("is quiet when production matches the migrations", () => {
    const changes = diffFingerprints(base, clone(base));
    expect(changes).toEqual([]);
    expect(worstSeverity(changes)).toBeNull();
  });

  it("CRITICAL: a customer table becomes readable by the anonymous key", () => {
    // DEFINING-STATEMENTS.md §6. This is the one change that is an exposure the
    // moment it happens rather than a change that needs explaining.
    const actual = clone(base);
    actual.tables.reservations.grants.anon = ["SELECT"];
    const changes = diffFingerprints(base, actual);
    expect(changes[0]).toMatchObject({ kind: "grant", object: "reservations", role: "anon", severity: "critical" });
    expect(worstSeverity(changes)).toBe("critical");
  });

  it("but NOT for the two tables that are deliberately public", () => {
    // `rates` and `extras_config` are granted to anon in migration 023 and the
    // booking form cannot price a rental without them. A check that called this
    // critical would cry wolf on a correct database every single night.
    expect(DELIBERATELY_PUBLIC_TABLES).toContain("rates");
    const actual = clone(base);
    actual.tables.rates.grants.anon = ["SELECT", "REFERENCES"];
    const changes = diffFingerprints(base, actual);
    expect(changes.every((change) => change.severity !== "critical")).toBe(true);
  });

  it("HIGH: losing the anon grant, which breaks public booking", () => {
    const actual = clone(base);
    delete actual.tables.rates.grants.anon;
    expect(diffFingerprints(base, actual)[0]).toMatchObject({ role: "anon", severity: "high" });
  });

  it("HIGH: RLS switched off, a lost service_role grant, a table nobody declared", () => {
    const rlsOff = clone(base);
    rlsOff.tables.reservations.rls_enabled = false;
    expect(diffFingerprints(base, rlsOff)[0]).toMatchObject({ kind: "table.rls_enabled", severity: "high" });

    const grantGone = clone(base);
    delete grantGone.tables.reservations.grants.service_role;
    expect(diffFingerprints(base, grantGone)[0]).toMatchObject({ role: "service_role", severity: "high" });

    const extra = clone(base);
    extra.tables.secret_exports = table();
    expect(diffFingerprints(base, extra)[0]).toMatchObject({ kind: "tables.added", object: "secret_exports", severity: "high" });

    const missing = clone(base);
    delete missing.tables.reservations;
    expect(diffFingerprints(base, missing)[0]).toMatchObject({ kind: "tables.missing", severity: "high" });
  });

  it("HIGH: a security-definer function, which hands out privileges its caller lacks", () => {
    const actual = clone(base);
    actual.functions["escalate()"] = { security_definer: true, returns: "void" };
    expect(diffFingerprints(base, actual)[0]).toMatchObject({ kind: "functions.added", severity: "high" });

    const ordinary = clone(base);
    ordinary.functions["helper()"] = { security_definer: false, returns: "text" };
    expect(diffFingerprints(base, ordinary)[0].severity).toBe("normal");
  });

  it("reports an added index without shouting about it", () => {
    const actual = clone(base);
    actual.tables.reservations.indexes = ["reservations_pickup_idx"];
    const changes = diffFingerprints(base, actual);
    expect(changes[0]).toMatchObject({ kind: "indexes.added", severity: "normal" });
    expect(worstSeverity(changes)).toBe("normal");
  });

  it("ignores extensions, which differ from PGlite by construction", () => {
    const actual = clone(base);
    actual.extensions = { plpgsql: "1.0", pg_graphql: "1.5.0", pgcrypto: "1.3" };
    expect(diffFingerprints(base, actual)).toEqual([]);
  });

  it("does not mistake catalog ordering for a change", () => {
    const actual = clone(base);
    actual.tables.reservations.grants.service_role = ["SELECT"];
    actual.tables.reservations.indexes = [];
    expect(digest(normaliseFingerprint(actual))).toBe(digest(base));
  });
});

describe("a declared change is absorbed; an exposure never is", () => {
  const marker = { migration: "046_x.sql", expected_objects: ["secret_exports"] };

  it("absorbs the change its marker named", () => {
    const actual = clone(base);
    actual.tables.secret_exports = table();
    const explained = explainWith(diffFingerprints(base, actual), [marker]);
    expect(explained[0]).toMatchObject({ severity: "explained", explained_by: "secret_exports" });
    expect(worstSeverity(explained)).toBe("normal");
  });

  it("absorbs the child objects a marker could not have predicted", () => {
    // Nobody writing a marker lists the primary-key index that `create table`
    // produces. Loose matching is deliberate; the next case is its limit.
    const actual = clone(base);
    actual.tables.reservations.indexes = ["reservations_pkey_extra"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations"] },
    ]);
    expect(explained[0].severity).toBe("explained");
  });

  it("NEVER absorbs a critical exposure, whatever was declared", () => {
    // A marker records what somebody intended. `critical` records what is true.
    const actual = clone(base);
    actual.tables.reservations.grants.anon = ["SELECT"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations", "grant", "anon"] },
    ]);
    expect(explained[0].severity).toBe("critical");
    expect(worstSeverity(explained)).toBe("critical");
  });
});

describe("row counts, which are what a deletion looks like", () => {
  it("escalates a fall beyond tolerance and merely notes a small one", () => {
    expect(compareCounts({ reservations: 400 }, { reservations: 100 })[0]).toMatchObject({
      kind: "rows.fell",
      severity: "high",
    });
    expect(compareCounts({ reservations: 400 }, { reservations: 399 })[0]).toMatchObject({ severity: "normal" });
  });

  it("says nothing about a rise, which is ordinary business", () => {
    expect(compareCounts({ reservations: 400 }, { reservations: 450 })).toEqual([]);
  });

  it("reports that it could not check rather than reporting nothing", () => {
    // The first run has no previous counts. Silence there would read as "no
    // deletions", which is the failure mode this whole file is written against.
    expect(compareCounts(null, { reservations: 400 })[0]).toMatchObject({
      kind: "counts.unavailable",
      severity: "high",
    });
    expect(compareCounts({}, { reservations: 400 })[0].kind).toBe("counts.unavailable");
  });

  it("notices a table that had counts last night and none tonight", () => {
    expect(compareCounts({ reservations: 400, quotes: 10 }, { reservations: 400 })[0]).toMatchObject({
      kind: "rows.gone",
      object: "quotes",
      severity: "high",
    });
  });
});

describe("the report says the worst thing first", () => {
  it("leads with the headline a reader decides on", () => {
    const actual = clone(base);
    actual.tables.reservations.grants.anon = ["SELECT"];
    const report = renderReport({
      changes: explainWith(diffFingerprints(base, actual), []),
      expectedDigest: "aaa",
      actualDigest: "bbb",
    });
    expect(report.split("\n")[2]).toContain("CRITICAL");
    expect(report).toContain("revoke the grant before anything else");
  });

  it("says plainly when there is nothing to say", () => {
    const report = renderReport({ changes: [], expectedDigest: "aaa", actualDigest: "aaa" });
    expect(report).toContain("Production matches the repository");
    expect(report).not.toContain("## What to do");
  });
});

/**
 * The SQL, against a real Postgres with every migration replayed.
 *
 * Slow by the standards of this file — it boots a WASM Postgres and applies 45
 * migrations — and it is the part that could not be faked. W28 covers the cost
 * of PGlite boots generally.
 */
describe("the catalog queries work on a real database", () => {
  it("produces a substantial fingerprint, not an empty object", async () => {
    const fingerprint = await withReplayedDatabase((database) =>
      queryJson(database, "scripts/sql/production-fingerprint.sql"),
    );

    // Asserted as ranges rather than exact numbers: this must not fail every
    // time a migration adds a table. It must fail if the query stops returning
    // anything, which is the fault that would make every comparison pass.
    expect(Object.keys(fingerprint.tables).length).toBeGreaterThan(20);
    expect(Object.keys(fingerprint.functions).length).toBeGreaterThan(5);

    const reservations = fingerprint.tables.reservations;
    expect(reservations, "no reservations table in the fingerprint").toBeTruthy();
    expect(reservations.rls_enabled).toBe(true);
    expect(Object.keys(reservations.columns).length).toBeGreaterThan(10);
    expect(reservations.grants.service_role).toContain("SELECT");
    expect(Object.keys(reservations.indexes).length).toBeGreaterThan(0);
  }, 120_000);

  it("finds exactly the two tables §6 says are public — an independent check of the rule", async () => {
    const fingerprint = await withReplayedDatabase((database) =>
      queryJson(database, "scripts/sql/production-fingerprint.sql"),
    );
    const readable = Object.entries(fingerprint.tables)
      .filter(([, value]) => ((value as TableFingerprint).grants?.anon ?? []).length > 0)
      .map(([name]) => name)
      .sort();
    expect(readable).toEqual([...DELIBERATELY_PUBLIC_TABLES].sort());
  }, 120_000);

  it("counts rows, and the fingerprint carries none of their contents", async () => {
    // The privacy assertion. A recognisable value is seeded and then looked for
    // in the fingerprint's full text. The repository is public; the fingerprint
    // leaves production every night.
    const canary = "canary-7f3a9e-surname";
    const seed = `
      insert into public.customers (id, first_name, last_name, email, phone)
      values (gen_random_uuid(), 'Canary', '${canary}', 'canary@example.invalid', '+300000000000');
    `;

    const { fingerprint, counts } = await withReplayedDatabase(
      async (database) => ({
        fingerprint: await queryJson(database, "scripts/sql/production-fingerprint.sql"),
        counts: await queryJson(database, "scripts/sql/production-counts.sql"),
      }),
      { seed },
    );

    expect(counts.customers, "the counts query did not count the seeded customer").toBe(1);
    expect(JSON.stringify(fingerprint)).not.toContain(canary);
    expect(JSON.stringify(fingerprint)).not.toContain("canary@example.invalid");
    // And the counts file itself must be numbers only.
    for (const value of Object.values(counts)) expect(typeof value).toBe("number");
  }, 120_000);
});

describe("the SQL files cannot quietly stop being read-only", () => {
  it("contains no statement that writes", () => {
    // A monitoring query is run against production nightly with a privileged
    // credential. It must be impossible for it to change anything — and the
    // cheapest guarantee is that the file contains no writing verb at all.
    for (const path of ["scripts/sql/production-fingerprint.sql", "scripts/sql/production-counts.sql"]) {
      const sql = readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .toLowerCase();
      // Whole words, not substrings. `pg_attribute.attisdropped` is a catalog
      // column and `role_table_grants` a catalog view, and the first version of
      // this test failed on both — the same confusion between *describing* an
      // action and *performing* one that has now bitten the production gate six
      // times. The question is whether the file runs a writing statement, and
      // that is a word at a boundary, never a letter sequence.
      for (const verb of ["insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate"]) {
        expect(new RegExp(`\\b${verb}\\b`).test(sql), `${path} contains \`${verb}\``).toBe(false);
      }
    }
  });
});
