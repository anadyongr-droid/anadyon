import { createHash } from "node:crypto";

/**
 * The post-event half of agent oversight: compare production's **structure**
 * with what the repository says it should be, every night, and escalate what no
 * declaration explains.
 *
 * **Why this exists, and why it is the only control here that can see the thing
 * we actually fear.** Every other control in this project runs on the machine
 * the agents run on: a `PreToolUse` gate, deny lists, a Codex config. All of
 * them are *prevention*, all of them see only a tool call, and none of them sees
 * a click in a logged-in production dashboard — which is the path all three
 * review passes named as the largest residual risk. Production state can.
 * Something that happened leaves a trace whatever route it took.
 *
 * **The expected side is the migrations, replayed.** Not a baseline file
 * somebody seeded from production once, which would have to be refreshed by hand
 * and would quietly come to mean "whatever production looked like the last time
 * anyone looked". `scripts/sql/production-fingerprint.sql` runs against a PGlite
 * database with every migration applied, and against production, and the two
 * results are diffed. One file, two callers — the rule
 * `DEFINING-STATEMENTS.md` §5 states for pricing, for the same reason: two
 * queries that drift produce a diff nobody trusts, and an untrusted alarm gets
 * muted.
 *
 * **What a legitimate change looks like.** `AGENTS.md` forbids an agent applying
 * a migration, so a human pastes it into the SQL editor and the structural
 * change arrives with no automated trail. A diff is therefore *normal* between
 * the paste and the merge. `supabase/expected-changes/` is how that is declared
 * in advance, and `explainWith` below is where a declaration absorbs the change
 * it predicted. Without it this check would fire on every legitimate migration —
 * and **an alarm that cries wolf monthly gets muted, which is worse than none
 * because it still looks present.**
 *
 * **Three things it cannot do**, stated here rather than discovered later:
 *
 * 1. **It cannot see a read.** Fable's review established this and it is the
 *    sharpest limit: selecting every customer row changes no state, so no state
 *    diff will ever show it. `pgaudit` is the only thing that sees a read, it
 *    needs a production database change, and it is blocked on one unverified
 *    fact — which Postgres role the dashboard's table editor runs as. W31.
 * 2. **It cannot see a change that was reverted** before the next run. The
 *    window is one night.
 * 3. **It cannot attribute.** A diff says what changed, never who. Attribution
 *    needs the gate's decision log, and only for tool calls.
 */

/** Tables the public booking form cannot price without. `DEFINING-STATEMENTS.md` §6. */
export const DELIBERATELY_PUBLIC_TABLES = ["rates", "extras_config"];

export const SEVERITIES = ["critical", "high", "normal", "explained"];

/**
 * Normalise a fingerprint so a diff reflects the database and not the order a
 * catalog happened to return rows in.
 *
 * `JSON.parse` already gives stable key *access*, but two fingerprints are
 * compared value by value below, and an array whose order differs between
 * PGlite and production would otherwise read as a change. Arrays are sorted;
 * objects are rebuilt in key order.
 */
export function normaliseFingerprint(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk).sort(compareJson);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.keys(node).sort().map((key) => [key, walk(node[key])]));
    }
    return node;
  };
  return walk(value);
}

const compareJson = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

/** A short, stable digest, so a report can say "unchanged" in one line. */
export function digest(fingerprint) {
  return createHash("sha256").update(JSON.stringify(normaliseFingerprint(fingerprint))).digest("hex").slice(0, 16);
}

/**
 * Every structural difference between what the migrations build and what
 * production holds.
 *
 * Extensions are collected but **never diffed**: production runs
 * `pg_graphql`, `pgcrypto`, `uuid-ossp` and others that PGlite does not have,
 * so diffing them would put a dozen permanent entries in every report. A report
 * with permanent noise in it is read once.
 */
export function diffFingerprints(expected, actual) {
  const exp = normaliseFingerprint(expected);
  const act = normaliseFingerprint(actual);
  const changes = [];
  const add = (change) => changes.push({ ...change, severity: classify(change) });

  for (const area of ["tables", "views", "functions"]) {
    const expected_ = exp[area] ?? {};
    const actual_ = act[area] ?? {};
    for (const name of Object.keys(actual_)) {
      if (!(name in expected_)) add({ kind: `${area}.added`, object: name, detail: actual_[name] });
    }
    for (const name of Object.keys(expected_)) {
      if (!(name in actual_)) add({ kind: `${area}.missing`, object: name });
    }
  }

  for (const [table, expectedTable] of Object.entries(exp.tables ?? {})) {
    const actualTable = (act.tables ?? {})[table];
    if (!actualTable) continue; // already reported as missing

    for (const flag of ["rls_enabled", "rls_forced"]) {
      if (expectedTable[flag] !== actualTable[flag]) {
        add({ kind: `table.${flag}`, object: table, expected: expectedTable[flag], actual: actualTable[flag] });
      }
    }

    diffMap(expectedTable.columns, actualTable.columns, (name, expectedValue, actualValue) =>
      add({ kind: "column", object: `${table}.${name}`, expected: expectedValue, actual: actualValue }),
    );

    // Grants are the boundary §6 is about, so they are diffed per role rather
    // than as one blob: "anon gained select" and "service_role lost select" are
    // different events with different severities, and a blob comparison would
    // report one change and hide which.
    const roles = new Set([...Object.keys(expectedTable.grants ?? {}), ...Object.keys(actualTable.grants ?? {})]);
    for (const role of roles) {
      const expectedPrivs = (expectedTable.grants ?? {})[role];
      const actualPrivs = (actualTable.grants ?? {})[role];
      if (JSON.stringify(expectedPrivs) !== JSON.stringify(actualPrivs)) {
        add({ kind: "grant", object: `${table}`, role, expected: expectedPrivs ?? null, actual: actualPrivs ?? null });
      }
    }

    diffMap(expectedTable.policies, actualTable.policies, (name, expectedValue, actualValue) =>
      add({ kind: "policy", object: `${table}.${name}`, expected: expectedValue, actual: actualValue }),
    );

    for (const listed of ["triggers", "indexes"]) {
      const expectedList = expectedTable[listed] ?? [];
      const actualList = actualTable[listed] ?? [];
      for (const item of actualList) {
        if (!expectedList.includes(item)) add({ kind: `${listed}.added`, object: `${table}.${item}` });
      }
      for (const item of expectedList) {
        if (!actualList.includes(item)) add({ kind: `${listed}.missing`, object: `${table}.${item}` });
      }
    }
  }

  return changes.sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.object.localeCompare(b.object),
  );
}

function diffMap(expected = {}, actual = {}, report) {
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
      report(key, expected[key] ?? null, actual[key] ?? null);
    }
  }
}

/**
 * How loudly a change should be reported.
 *
 * **`critical` is reserved for one thing: a table becoming readable by the
 * anonymous key.** `DEFINING-STATEMENTS.md` §6 — *"Row-level security filters
 * rows, not columns, so a readable table is a readable table"* — and the two
 * tables that are deliberately public are named rather than inferred, because
 * the whole value of the rule is that the list is short and explicit. This is
 * the one change that is a customer-data exposure the moment it happens, rather
 * than a change that needs explaining.
 *
 * **`high` is for anything that would break the application or that nobody
 * planned**: a table or column production does not have but the code expects, a
 * new table nobody declared, RLS switched off, a `service_role` grant lost
 * (which is migration 046's whole subject), a new security-definer function.
 *
 * **`normal` is for additions that are plausible and harmless on their own** —
 * an index, a trigger — which still get reported, because a nightly report that
 * lists only emergencies cannot be read for trend.
 */
export function classify(change) {
  const table = String(change.object ?? "").split(".")[0];

  if (change.kind === "grant") {
    const privs = [...(change.actual ?? [])];
    if (change.role === "anon" || change.role === "PUBLIC") {
      const deliberate = DELIBERATELY_PUBLIC_TABLES.includes(table);
      if (!deliberate && privs.length > 0) return "critical";
      // Losing the grant on a deliberately public table breaks public booking:
      // the form cannot price a rental without `rates` and `extras_config`.
      if (deliberate && privs.length === 0) return "high";
      return "normal";
    }
    if (change.role === "service_role" && privs.length === 0) return "high";

    // For every other role, a **missing** privilege matters and an **extra** one
    // does not. That asymmetry is not a convenience: it is what the first real
    // run against production taught, 3 October 2026.
    //
    // Thirteen of its twenty-seven `high` rows were one shape — `service_role`
    // holding `REFERENCES`, `TRIGGER` and `TRUNCATE` on top of the four
    // privileges the migrations grant. Supabase's default privileges grant `ALL`
    // on a new table in `public`; PGlite has no such defaults, so the replay
    // shows only what each migration wrote. The difference is real, permanent,
    // and says nothing — and it buried the thirteen rows that did say something.
    //
    // **Permanent noise is the specific way this kind of control dies.** A
    // report whose first screen is always the same thirteen lines gets skimmed,
    // then filtered, then muted. So an extra privilege for a privileged role is
    // reported at `normal`, where it stays visible and stops shouting, and a
    // privilege the application needs and has **lost** is still `high`.
    const missing = (change.expected ?? []).filter((priv) => !privs.includes(priv));
    return missing.length > 0 ? "high" : "normal";
  }

  if (change.kind === "table.rls_enabled") return change.actual === false ? "high" : "normal";
  if (change.kind === "table.rls_forced") return "normal";
  if (change.kind === "tables.missing" || change.kind === "views.missing" || change.kind === "functions.missing") return "high";
  if (change.kind === "tables.added") return "high";
  if (change.kind === "column") return "high";
  if (change.kind === "policy") return "high";
  if (change.kind === "functions.added") return change.detail?.security_definer ? "high" : "normal";
  if (change.kind === "views.added") return "high";
  if (change.kind === "indexes.added" || change.kind === "triggers.added") return "normal";
  if (change.kind === "indexes.missing" || change.kind === "triggers.missing") return "high";
  return "normal";
}

/**
 * Absorbs the changes a committed declaration predicted.
 *
 * A marker names a migration, its digest and the objects it touches. A change
 * whose object is named by an open marker is **explained**: it is the migration
 * being pasted before the branch merged, which is the ordinary order of work
 * here.
 *
 * **Matching is by object name and deliberately loose**, because a marker is
 * written by a person before the change exists and cannot be expected to
 * predict that `create table x` also creates `x_pkey`. Loose matching risks
 * absorbing a change the marker did not mean — so two guards: a marker only
 * ever absorbs changes to objects it names or their children, and **a `critical`
 * change is never absorbed.** An anonymous grant is reported whatever anyone
 * declared, because the marker says what someone *intended* and `critical` says
 * what is *true*.
 */
export function explainWith(changes, markers = []) {
  const names = markers.flatMap((marker) =>
    (marker.expected_objects ?? []).map((object) => String(object).toLowerCase()),
  );
  return changes.map((change) => {
    if (change.severity === "critical") return change;
    const object = String(change.object ?? "").toLowerCase();
    const hit = names.find((name) => object === name || object.startsWith(`${name}.`) || name.includes(object));
    return hit ? { ...change, severity: "explained", explained_by: hit } : change;
  });
}

/**
 * Night-to-night row counts, which the structural diff cannot cover.
 *
 * Counts cannot be compared against the migrations — a freshly replayed
 * database has none — so they are compared with last night's, carried between
 * runs outside the repository.
 *
 * **A fall is the event worth catching**, and it is the specific fear this whole
 * exercise started from: an agent deleting production rows. A rise is ordinary
 * business. `tolerance` exists because real deletions happen — a cancelled
 * reservation, a purge of expired holds — so a small fall is reported and a
 * large one escalates.
 */
export function compareCounts(previous, current, { tolerance = 0.05 } = {}) {
  if (!previous || Object.keys(previous).length === 0) {
    return [{ kind: "counts.unavailable", object: "—", severity: "high", detail: "no previous counts, so a deletion cannot be detected tonight" }];
  }
  const changes = [];
  for (const [table, count] of Object.entries(current ?? {})) {
    const before = previous[table];
    if (before === undefined) continue;
    if (count < before) {
      const lost = before - count;
      const share = before === 0 ? 1 : lost / before;
      changes.push({
        kind: "rows.fell",
        object: table,
        expected: before,
        actual: count,
        detail: `${lost} fewer rows (${(share * 100).toFixed(1)}%)`,
        severity: share > tolerance ? "high" : "normal",
      });
    }
  }
  for (const table of Object.keys(previous)) {
    if (!(table in (current ?? {}))) {
      changes.push({ kind: "rows.gone", object: table, severity: "high", detail: "table had counts last night and none tonight" });
    }
  }
  return changes;
}

/** The worst severity present, or null when everything is quiet. */
export function worstSeverity(changes) {
  for (const severity of ["critical", "high"]) {
    if (changes.some((change) => change.severity === severity)) return severity;
  }
  return changes.length > 0 ? "normal" : null;
}

/**
 * The report a person reads at breakfast.
 *
 * Written so the **first line decides whether to read the rest**. A nightly
 * report that opens with a table of contents is a nightly report nobody opens,
 * and this project has already learned that a channel which carries routine
 * success trains the reader to skim past the message that matters
 * (`.github/workflows/backup.yml`: *"Only on failure"*).
 */
export function renderReport({ changes, counts = [], at = new Date(), expectedDigest, actualDigest, markers = [] }) {
  const all = [...changes, ...counts];
  const worst = worstSeverity(all);
  const headline = {
    critical: "CRITICAL — production exposes data it should not",
    high: "ATTENTION — production differs from the repository in ways nothing explains",
    normal: "Minor differences only",
    null: "Production matches the repository",
  }[String(worst)];

  const lines = [
    `# Production fingerprint — ${at.toISOString().slice(0, 16).replace("T", " ")}Z`,
    "",
    `**${headline}**`,
    "",
    `Expected (migrations replayed) \`${expectedDigest}\` · actual (production) \`${actualDigest}\``,
    markers.length > 0 ? `${markers.length} expected-change marker(s) in force.` : "No expected-change markers in force.",
    "",
  ];

  if (all.length === 0) {
    lines.push("No structural difference, and no table lost rows.", "");
    return lines.join("\n");
  }

  for (const severity of SEVERITIES) {
    const group = all.filter((change) => change.severity === severity);
    if (group.length === 0) continue;
    lines.push(`## ${severity} (${group.length})`, "");
    for (const change of group) {
      const bits = [`\`${change.object}\``, change.kind];
      if (change.role) bits.push(`role \`${change.role}\``);
      if (change.detail && typeof change.detail === "string") bits.push(change.detail);
      if (change.expected !== undefined || change.actual !== undefined) {
        bits.push(`expected ${JSON.stringify(change.expected ?? null)}, found ${JSON.stringify(change.actual ?? null)}`);
      }
      if (change.explained_by) bits.push(`declared as \`${change.explained_by}\``);
      lines.push(`- ${bits.join(" — ")}`);
    }
    lines.push("");
  }

  if (worst === "critical" || worst === "high") {
    lines.push(
      "## What to do",
      "",
      "1. If you made this change, commit a marker in `supabase/expected-changes/` naming the objects, or merge the migration.",
      "2. If you did not, it was made through the dashboard or with a credential. Check the Supabase audit log for the window, and read the gate's decision log on each machine.",
      "3. A `critical` row is a customer-data exposure now, not a question: revoke the grant before anything else.",
      "",
    );
  }
  return lines.join("\n");
}
