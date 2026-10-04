import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHANGE_KINDS,
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
  // Definitions, added 4 October 2026: a name says an index exists, not what it
  // indexes. Optional because most fixtures here are about something else.
  index_definitions?: Record<string, string>;
  trigger_definitions?: Record<string, string>;
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

  it("stays quiet about a privilege production has and the migrations do not — the first run's noise", () => {
    // Thirteen of the first real run's twenty-seven `high` rows were this one
    // shape: `service_role` holding REFERENCES, TRIGGER and TRUNCATE on top of
    // the four privileges the migrations grant, because Supabase's default
    // privileges grant ALL on a new table in `public` and PGlite has no such
    // defaults. Permanent, harmless, and it buried the thirteen rows that
    // mattered — which is how a nightly report stops being read.
    const actual = clone(base);
    actual.tables.reservations.grants.service_role = ["SELECT", "REFERENCES", "TRIGGER", "TRUNCATE"];
    const changes = diffFingerprints(base, actual);
    expect(changes[0]).toMatchObject({ kind: "grant", role: "service_role", severity: "normal" });
    expect(worstSeverity(changes)).toBe("normal");
  });

  it("HIGH: a privilege the application needs and has LOST", () => {
    // The other half of the asymmetry. Extra is noise; missing breaks the app.
    const actual = clone(base);
    actual.tables.reservations.grants.service_role = ["REFERENCES", "TRIGGER"];
    expect(diffFingerprints(base, actual)[0]).toMatchObject({ role: "service_role", severity: "high" });
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

  it("absorbs the mechanical byproducts a marker could not have predicted", () => {
    // Nobody writing a marker lists the primary-key index that `create table`
    // produces, so an index or trigger on a declared table is absorbed.
    const actual = clone(base);
    actual.tables.reservations.indexes = ["reservations_pkey_extra"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations"] },
    ]);
    expect(explained[0].severity).toBe("explained");
  });

  it("does NOT absorb a column or policy change on a declared table", () => {
    // The real failure, 4 October 2026, on the mechanism's first use in
    // production. Migration 047 grants privileges on six tables, so its marker
    // names them — `quotes` among them — and the old child rule let a
    // declaration about *grants* silence twelve unrelated *column* differences.
    // They appeared annotated `declared as quotes`: explained by a migration
    // that has nothing to do with them and was never applied.
    //
    // A marker that cries wolf gets muted. A marker that absorbs what it did
    // not cause makes the check lie, which is worse — the report still looks
    // attentive.
    const actual = clone(base);
    actual.tables.reservations.columns.pickup_date = "text";
    actual.tables.reservations.policies = { "Service role only": { using: "false" } };

    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations"] },
    ]);
    // Annotated because the comparison library is `.mjs` and these callbacks
    // would otherwise be implicitly `any`.
    type Change = { kind: string; severity: string };
    const column = explained.find((change: Change) => change.kind === "column");
    const policy = explained.find((change: Change) => change.kind === "policy");
    expect(column, "no column change was produced, so this passes vacuously").toBeTruthy();
    expect(column!.severity, "a grant declaration absorbed a column change").toBe("high");
    expect(policy!.severity, "a grant declaration absorbed a policy change").toBe("high");
    expect(worstSeverity(explained)).toBe("high");
  });

  it("no longer absorbs by substring, which could swallow almost anything", () => {
    // `name.includes(object)` was the other half of the old rule and was never
    // justified: a marker naming `booking_email_deliveries` would absorb any
    // change whose object appeared anywhere inside that string.
    const actual = clone(base);
    actual.tables.rates.rls_enabled = false;
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["rates_history_archive"] },
    ]);
    expect(explained[0].severity).toBe("high");
  });

  it("does NOT absorb a grant to a role the marker never named", () => {
    // The residual half of the 4 October failure, found while recording the
    // first one. A grant difference is reported against the *table*, so a
    // marker naming the table absorbed a grant to any role on it. Migration
    // 047's marker names six tables because it grants to `anadyon_audit`, and
    // it absorbed two `service_role` rows on `booking_email_deliveries` and
    // `booking_email_events` — the Data API residue migration 046 closes, not
    // anything 047 does. Only `normal` severity was masked, so nothing was
    // lost; the mechanism was wrong all the same.
    const actual = clone(base);
    actual.tables.reservations.grants.service_role = ["SELECT", "DELETE"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations", "anadyon_audit"] },
    ]);
    expect(explained[0]).toMatchObject({ kind: "grant", role: "service_role" });
    expect(explained[0].severity, "a marker naming the table absorbed a grant to another role").toBe(
      "normal",
    );
    expect(explained[0].explained_by).toBeUndefined();
  });

  it("absorbs a grant when the marker names both the table and the grantee", () => {
    // Which is what a marker for a grant migration should say: who was granted
    // what, not merely where. 047's own marker already names the role.
    const actual = clone(base);
    actual.tables.reservations.grants.anadyon_audit = ["SELECT"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations", "anadyon_audit"] },
    ]);
    expect(explained[0]).toMatchObject({ kind: "grant", role: "anadyon_audit", severity: "explained" });
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

describe("an object that exists on both sides is compared, not assumed identical", () => {
  // The largest blind spot found in this check, reported by Codex on 4 October
  // 2026 after probing it rather than reading it: `views` and `functions` were
  // compared by existence only, so flipping an existing function to
  // `security definer` produced no findings at all.
  const withObjects = () => ({
    ...clone(base),
    views: { customer_summary: { kind: "v", definition: "SELECT id, email FROM customers" } },
    functions: {
      "actor_role()": { security_definer: false, returns: "text", definition: "CREATE FUNCTION actor_role() ..." },
    },
  });

  it("HIGH: an existing function becomes security definer", () => {
    const expected = withObjects();
    const actual = withObjects();
    actual.functions["actor_role()"].security_definer = true;
    const changes = diffFingerprints(expected, actual);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "function.security_definer", object: "actor_role()", severity: "high" });
  });

  it("reports a redefined view rather than staying silent", () => {
    // A view is a stored select statement: widening one exposes a column with no
    // new object to notice.
    const expected = withObjects();
    const actual = withObjects();
    actual.views.customer_summary.definition = "SELECT id, email, phone, dob FROM customers";
    const changes = diffFingerprints(expected, actual);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "view.definition", object: "customer_summary" });
  });

  it("but not when only the server's whitespace differs", () => {
    // The replay runs PostgreSQL 18.3 under PGlite and production is 17.6, and
    // these definitions are re-rendered from a parse tree by the server. A line
    // break is not a change, and a check that reported one every night would be
    // muted within a week.
    const expected = withObjects();
    const actual = withObjects();
    actual.views.customer_summary.definition = " SELECT id,\n    email\n   FROM customers;";
    expected.views.customer_summary.definition = "SELECT id, email FROM customers";
    expect(diffFingerprints(expected, actual)).toEqual([]);
  });

  it("reports a redefined index, which keeps its name", () => {
    const expected = clone(base);
    const actual = clone(base);
    expected.tables.reservations.indexes = ["reservations_pickup_idx"];
    actual.tables.reservations.indexes = ["reservations_pickup_idx"];
    expected.tables.reservations.index_definitions = {
      reservations_pickup_idx: "CREATE INDEX reservations_pickup_idx ON public.reservations USING btree (pickup_at)",
    };
    actual.tables.reservations.index_definitions = {
      reservations_pickup_idx:
        "CREATE INDEX reservations_pickup_idx ON public.reservations USING btree (pickup_at) WHERE (cancelled_at IS NULL)",
    };
    const changes = diffFingerprints(expected, actual);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "index.definition", object: "reservations.reservations_pickup_idx" });
  });

  it("does not report a definition twice for an index that merely appeared", () => {
    // It is already reported by name. Counting it twice is how a report's
    // numbers stop meaning anything.
    const expected = clone(base);
    const actual = clone(base);
    actual.tables.reservations.indexes = ["reservations_new_idx"];
    actual.tables.reservations.index_definitions = { reservations_new_idx: "CREATE INDEX ..." };
    const changes = diffFingerprints(expected, actual);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("indexes.added");
  });
});

describe("a grant to a role a stranger can hold", () => {
  it("CRITICAL: `authenticated` gains access to a customer table", () => {
    // Codex probed this on 4 October 2026 and found it came back `normal`: the
    // noise rule written for Supabase's `service_role` defaults was applied to
    // every role but `anon`. On a Supabase project `authenticated` is any holder
    // of a valid JWT.
    const actual = clone(base);
    actual.tables.reservations.grants.authenticated = ["SELECT"];
    const changes = diffFingerprints(base, actual);
    expect(changes[0]).toMatchObject({ kind: "grant", role: "authenticated", severity: "critical" });
    expect(worstSeverity(changes)).toBe("critical");
  });

  it("and a marker cannot explain it away", () => {
    const actual = clone(base);
    actual.tables.reservations.grants.authenticated = ["SELECT"];
    const explained = explainWith(diffFingerprints(base, actual), [
      { expected_objects: ["reservations", "authenticated"], expected_kinds: ["grant"] },
    ]);
    expect(explained[0].severity).toBe("critical");
  });

  it("but a privilege the migrations themselves grant produces no row at all", () => {
    // Which is why escalating `authenticated` cannot cry wolf: a legitimate
    // grant is on both sides of the comparison.
    const expected = clone(base);
    const actual = clone(base);
    expected.tables.reservations.grants.authenticated = ["SELECT"];
    actual.tables.reservations.grants.authenticated = ["SELECT"];
    expect(diffFingerprints(expected, actual)).toEqual([]);
  });
});

describe("the audit switch, which is the only thing here that can see a read", () => {
  /**
   * **Why this is compared at all, and why it is `high` without exception.**
   * `pgaudit` is armed by a row in `pg_db_role_setting`, and that row is exactly
   * what a Supabase project reset, a restore from backup or a plan change drops
   * silently — leaving the extension installed, the audit role present and its
   * six grants intact. An audit that is **off while looking installed** is the
   * inert control this project has produced four times.
   *
   * It was going to need a one-sided assertion, because the replayed database
   * could not hold the setting. Then migration 047's database-level `set` turned
   * out to be accepted by PGlite and impossible on Supabase — *"PGAudit
   * modifications can only occur at the role level"*, their documentation — and
   * 049 both arms the role-level switch and `reset`s the database-level one. The
   * two sides now carry the same single row, so an ordinary comparison works.
   */
  const armed = {
    database: "(all databases)",
    role: "postgres",
    config: ["pgaudit.log=ddl, role, write", "pgaudit.role=anadyon_audit"],
  };
  const withSettings = (config: string[] | null) => {
    const fingerprint = clone(base) as Fingerprint & { settings?: unknown[] };
    fingerprint.settings = config === null ? [] : [{ ...armed, config }];
    return fingerprint;
  };

  it("HIGH: production has the audit role switch and then does not", () => {
    // Production's real state on 4 October 2026, before migration 049: only
    // `pgaudit.log` survived 047, so writes and DDL were logged and **reads were
    // not**, which is the one thing 047 existed for.
    const expected = withSettings(armed.config);
    const actual = withSettings(["pgaudit.log=ddl, role, write"]);
    const changes = diffFingerprints(expected, actual);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "setting", severity: "high" });
    expect(JSON.stringify(changes[0].expected)).toContain("pgaudit.role=anadyon_audit");
    expect(JSON.stringify(changes[0].actual)).not.toContain("pgaudit.role");
  });

  it("HIGH: the whole row disappears, which is what a project reset would do", () => {
    const changes = diffFingerprints(withSettings(armed.config), withSettings(null));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "settings.missing", severity: "high" });
  });

  it("HIGH: a setting appears that the repository does not declare", () => {
    const changes = diffFingerprints(withSettings(null), withSettings(["pgaudit.role=someone_else"]));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "settings.added", severity: "high" });
  });

  it("is silent when the switch is where the migrations put it", () => {
    expect(diffFingerprints(withSettings(armed.config), withSettings(armed.config))).toEqual([]);
  });

  it("and a marker that does not declare the kind cannot explain it away", () => {
    const changes = diffFingerprints(withSettings(armed.config), withSettings(null));
    const explained = explainWith(changes, [
      { expected_objects: ["(all databases) / postgres", "pgaudit"], expected_kinds: ["grant"] },
    ]);
    expect(explained[0].severity).toBe("high");
  });
});

describe("a marker is bound to the kind of change it declares", () => {
  it("a grant declaration does not absorb a missing index on a table it names", () => {
    // The one shape the 4 October narrowing would have left open: `indexes.*`
    // was allowed to skip the kind filter as a "mechanical byproduct", and the
    // only reason production's missing `quote_rate_limits_blocked_idx` was not
    // masked is that migration 047's marker happens not to name that table.
    const actual = clone(base);
    actual.tables.reservations.indexes = [];
    const expected = clone(base);
    expected.tables.reservations.indexes = ["reservations_blocked_idx"];

    const explained = explainWith(diffFingerprints(expected, actual), [
      { expected_objects: ["reservations"], expected_kinds: ["grant"] },
    ]);
    expect(explained[0]).toMatchObject({ kind: "indexes.missing", severity: "high" });
  });

  it("and does absorb one when the marker declares that kind", () => {
    const actual = clone(base);
    actual.tables.reservations.indexes = [];
    const expected = clone(base);
    expected.tables.reservations.indexes = ["reservations_blocked_idx"];

    const explained = explainWith(diffFingerprints(expected, actual), [
      { expected_objects: ["reservations"], expected_kinds: ["indexes.missing"] },
    ]);
    expect(explained[0].severity).toBe("explained");
  });

  it("every kind a marker may declare is a kind the comparison produces", () => {
    // `CHANGE_KINDS` is what `validateExpectedChange` checks a marker against,
    // so a kind missing from it cannot be declared and a kind in it that the
    // comparison never emits would bind nothing.
    const produced = new Set<string>();
    const expected = clone(base);
    const actual = clone(base);
    actual.tables.secret_exports = table();
    delete actual.tables.rates;
    actual.tables.reservations.rls_enabled = false;
    actual.tables.reservations.rls_forced = true;
    actual.tables.reservations.columns.extra = "text";
    actual.tables.reservations.grants.service_role = ["SELECT", "DELETE"];
    actual.tables.reservations.policies = { p: { using: "true" } };
    actual.tables.reservations.triggers = ["t"];
    actual.tables.reservations.indexes = ["i"];
    expected.tables.reservations.triggers = ["gone"];
    expected.tables.reservations.indexes = ["gone_idx"];
    for (const change of diffFingerprints(expected, actual)) produced.add(change.kind);
    for (const kind of produced) expect(CHANGE_KINDS, `${kind} is produced but not declarable`).toContain(kind);
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

  it("sees a grant that `information_schema` hides from the role we connect as", async () => {
    // **The defect, reproduced.** Codex reported it as "PUBLIC grants are
    // invisible", citing PostgreSQL's note that `role_table_grants` "omits
    // tables that have been made accessible to the current user by way of a
    // grant to PUBLIC". The real rule is broader and worse: both that view and
    // `table_privileges` show only rows "where the grantor or grantee is a
    // currently enabled role", so **a grant made by a role we are not a member
    // of is invisible whoever it was granted to**.
    //
    // That is production's exact situation. The nightly check connects as
    // `postgres`, and `postgres` on Supabase is **not** a superuser
    // (`rolsuper = false`, read from production on 3 October 2026) — so a grant
    // issued from the dashboard as `supabase_admin` would not have appeared.
    // Reading `pg_class.relacl` through `aclexplode` has no such scoping.
    //
    // The probe below is the whole finding in six lines: as a non-superuser
    // role, `information_schema` returns nothing and the fingerprint returns the
    // grant.
    const result = await withReplayedDatabase(async (database) => {
      await database.exec(`
        create role prober nologin;
        create role hidden_reader nologin;
        grant select on public.quotes to hidden_reader;
        grant select on public.quotes to public;
        set role prober;
      `);
      const informationSchema = await database.query(
        "select grantee from information_schema.role_table_grants" +
          " where table_schema = 'public' and table_name = 'quotes'" +
          " and grantee in ('hidden_reader', 'PUBLIC')",
      );
      const fingerprint = await queryJson(database, "scripts/sql/production-fingerprint.sql");
      await database.exec("reset role;");
      return { hidden: informationSchema.rows, fingerprint };
    });

    expect(
      result.hidden,
      "information_schema showed the grant, so this probe is not reproducing the defect",
    ).toEqual([]);
    expect(result.fingerprint.tables.quotes.grants.PUBLIC).toContain("SELECT");
  }, 120_000);

  it("names a role nobody declared, once, rather than on every table", async () => {
    // The backstop for the allow-list: the per-table `grants` map reads six
    // named roles, so a role created through the dashboard and granted `select`
    // on `customers` appears in none of them. `hidden_reader` in the probe above
    // is exactly that shape.
    const result = await withReplayedDatabase(async (database) => {
      const before = await queryJson(database, "scripts/sql/production-fingerprint.sql");
      await database.exec("create role sneaky nologin; grant select on public.customers to sneaky;");
      const after = await queryJson(database, "scripts/sql/production-fingerprint.sql");
      return { before, after };
    });

    expect(result.before.grantees, "a role is already listed, so this asserts nothing").toEqual([]);
    expect(result.after.grantees).toEqual(["sneaky"]);

    const changes = diffFingerprints(result.before, result.after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "grantees.added", object: "sneaky", severity: "high" });
  }, 120_000);

  it("carries the definition of every view, function, index and trigger", async () => {
    // Names alone were the blind spot Codex probed: an index narrowed to a
    // partial one, or a trigger repointed at another function, keeps its name.
    const fingerprint = await withReplayedDatabase((database) =>
      queryJson(database, "scripts/sql/production-fingerprint.sql"),
    );
    const views = Object.values(fingerprint.views) as { definition?: string }[];
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view.definition, "a view with no definition").toMatch(/select/i);

    const functions = Object.values(fingerprint.functions) as { definition?: string }[];
    for (const fn of functions) expect(fn.definition, "a function with no definition").toMatch(/function/i);

    const quotes = fingerprint.tables.quotes;
    expect(Object.keys(quotes.index_definitions).length).toBeGreaterThan(0);
    for (const definition of Object.values(quotes.index_definitions) as string[]) {
      expect(definition).toMatch(/create (unique )?index/i);
    }
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
        // Quoted literals are data, not statements, and since 4 October the
        // grant query names the seven SQL privileges as literals — `'INSERT'`,
        // `'UPDATE'`, `'DELETE'`, `'TRUNCATE'` — to exclude PostgreSQL 18's
        // `MAINTAIN` from a comparison whose other side is 17. Reading those as
        // writing verbs is the same confusion between *describing* an action and
        // *performing* one that the comment below is about; a statement that
        // writes is a bare word, never one in quotes.
        .replace(/'[^']*'/g, "''")
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

describe("a role this repository creates is visible to the check", () => {
  it("lists every role a migration creates in the fingerprint's grantee filter", () => {
    // **Why this test exists.** The grantee filter is an allow-list, because
    // naming production's dozen platform roles would put a grant row on every
    // table of every run. The cost of an allow-list is that it rots silently:
    // read on 4 October 2026, `anadyon_audit` was missing from it, so migration
    // 047's six grants — the mechanism that tells `pgaudit` which objects to
    // watch — were invisible on both sides of the comparison. Revoking them in
    // production would have disarmed the audit and no run would have said so.
    //
    // A missing role does not announce itself in a report: the rows are simply
    // absent, and absence is what the whole check is built to notice.
    const created = new Set<string>();
    for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      for (const match of sql.matchAll(/create\s+role\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        created.add(match[1].toLowerCase());
      }
    }
    expect(created.size, "no migration creates a role, so this test asserts nothing").toBeGreaterThan(0);

    const fingerprint = readFileSync("scripts/sql/production-fingerprint.sql", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const filter = /grantee in \(([^)]*)\)/.exec(fingerprint);
    expect(filter, "the grantee filter has moved — this test is reading the wrong place").not.toBeNull();
    const listed = new Set(
      [...(filter?.[1] ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1].toLowerCase()),
    );

    const missing = [...created].filter((role) => !listed.has(role));
    expect(
      missing,
      `created by a migration but not read by the fingerprint: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
