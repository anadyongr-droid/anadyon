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

/**
 * The roles a stranger can act as, which is what makes a grant to one of them
 * an exposure rather than a question.
 *
 * `anon` is the role the publishable key maps to — that key is in the public
 * HTML, so a grant to `anon` is a grant to the internet. `PUBLIC` is every role
 * at once, including `anon`.
 *
 * **`authenticated` was added 4 October 2026, after Codex's second review.** The
 * severity rule below treats an *extra* privilege for any other role as
 * `normal`, because thirteen of the first real run's `high` rows were Supabase's
 * default privileges for `service_role` and permanent noise is what gets a check
 * muted. Codex probed the edge of that and found a genuine hole: granting
 * `authenticated` access to `customers` came back `normal`. That rule was
 * written about privileged server-side roles and `authenticated` is not one —
 * on a Supabase project it is any holder of a valid JWT, which is anyone who can
 * sign up unless sign-ups are closed, and whether they are is not a fact this
 * check can read.
 *
 * **It cannot cry wolf:** a grant the migrations make appears on both sides of
 * the comparison and produces no row at all. Only an `authenticated` grant that
 * the repository does not contain reaches this function, and there is no
 * legitimate reason for one to exist.
 */
export const REACHABLE_WITHOUT_STAFF_CREDENTIALS = ["anon", "authenticated", "PUBLIC"];

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

  // **Any grantee the per-table map does not read, by name.** The `grants` map
  // reads six named roles, so a role created through the dashboard and granted
  // `select` on `customers` would appear nowhere in it. This list is the
  // backstop, and it is one row per role rather than one per table.
  const expectedGrantees = exp.grantees ?? [];
  const actualGrantees = act.grantees ?? [];
  for (const grantee of actualGrantees) {
    if (!expectedGrantees.includes(grantee)) add({ kind: "grantees.added", object: String(grantee) });
  }
  for (const grantee of expectedGrantees) {
    if (!actualGrantees.includes(grantee)) add({ kind: "grantees.missing", object: String(grantee) });
  }

  // **An object that exists on both sides is compared, not assumed identical.**
  // Added 4 October 2026, and it closes the largest blind spot found in this
  // check so far. Until now `views` and `functions` were compared by existence
  // only: Codex flipped an existing function to `security definer` in a
  // controlled probe and the report stayed silent. A view is a stored select
  // statement and a function can run as its owner — widening either exposes
  // data with no new object to notice.
  for (const area of ["views", "functions"]) {
    for (const [name, expectedObject] of Object.entries(exp[area] ?? {})) {
      const actualObject = (act[area] ?? {})[name];
      if (!actualObject || typeof expectedObject !== "object" || typeof actualObject !== "object") continue;
      for (const field of new Set([...Object.keys(expectedObject), ...Object.keys(actualObject)])) {
        const expectedValue = expectedObject[field];
        const actualValue = actualObject[field];
        const same =
          field === "definition"
            ? normaliseSql(expectedValue) === normaliseSql(actualValue)
            : JSON.stringify(expectedValue) === JSON.stringify(actualValue);
        if (same) continue;
        add({
          kind: `${area === "views" ? "view" : "function"}.${field}`,
          object: name,
          expected: expectedValue ?? null,
          actual: actualValue ?? null,
        });
      }
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

    // An index narrowed to a partial one, or a trigger repointed at another
    // function, keeps its name and changes everything it does. Only objects
    // present on **both** sides are compared here: one that appeared or
    // vanished is already reported by name above, and reporting it twice is how
    // a count stops meaning anything.
    for (const [held, kind] of [
      ["trigger_definitions", "trigger.definition"],
      ["index_definitions", "index.definition"],
    ]) {
      const expectedDefs = expectedTable[held] ?? {};
      const actualDefs = actualTable[held] ?? {};
      for (const [name, expectedDefinition] of Object.entries(expectedDefs)) {
        if (!(name in actualDefs)) continue;
        if (normaliseSql(expectedDefinition) === normaliseSql(actualDefs[name])) continue;
        add({ kind, object: `${table}.${name}`, expected: expectedDefinition, actual: actualDefs[name] });
      }
    }
  }

  return changes.sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.object.localeCompare(b.object),
  );
}

/**
 * Whitespace in a deparsed definition is the server's, not the author's.
 *
 * `pg_get_viewdef` and friends re-render a parse tree, so indentation and line
 * breaks are the server's choice and differ between major versions — and the
 * two sides of this comparison are **not** the same major version: the replay
 * runs PostgreSQL 18.3 under PGlite and production is 17.6 (read 19 August
 * 2026). Collapsing whitespace removes the cheapest source of a false
 * difference. Case and punctuation are left alone: a definition that differs in
 * a string literal's case is a difference worth seeing.
 */
function normaliseSql(value) {
  if (typeof value !== "string") return JSON.stringify(value ?? null);
  return value.replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
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
    if (REACHABLE_WITHOUT_STAFF_CREDENTIALS.includes(change.role)) {
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

  // **A structured field on an existing object is `high`.** `security_definer`
  // in either direction is a privilege change — gaining it makes a function run
  // as its owner, losing it breaks one that was meant to — and a view becoming
  // a materialised view, or a function's return type changing, is nothing a
  // nightly report should pass over.
  if (change.kind === "function.security_definer" || change.kind === "function.returns") return "high";
  if (change.kind === "view.kind") return "high";

  // A role holding privileges on a `public` table that the repository has never
  // heard of. It is not `critical`, because it may turn out to be a platform
  // role nobody had catalogued — but it is a role that can read customer data
  // and it has to be identified the same day.
  if (change.kind === "grantees.added") return "high";
  if (change.kind === "grantees.missing") return "normal";

  // **A deparsed definition is `normal` until one run has measured it**, and
  // that is a deliberate, dated compromise rather than a judgement that a
  // redefined view matters less. The expected side runs PostgreSQL 18.3 under
  // PGlite; production is 17.6. `pg_get_viewdef` and `pg_get_functiondef`
  // re-render a parse tree, and two major versions can render the same object
  // differently — which would put a row here for every view and all 34
  // functions, every night. At `high` that is a permanent red; `normal` keeps
  // the rows visible in the report without teaching anybody to skim it.
  //
  // **The first run decides it** (W49): if the two servers agree, these promote
  // to `high` the same day. If they disagree, the answer is to match the
  // versions, not to keep the noise.
  if (change.kind.endsWith(".definition")) return "normal";

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
 *
 * **A grant needs both halves named — the table and the grantee.** Tightened
 * 4 October 2026, from the same run that produced W44 and for the same reason. A
 * grant difference is reported against the table, so a marker naming the table
 * absorbed a grant to *any* role on it: migration 047's marker, which names six
 * tables because it grants to `anadyon_audit`, absorbed two `service_role` grant
 * rows on `booking_email_deliveries` and `booking_email_events` that it does not
 * cause — those belong to the Data API residue migration 046 closes. The
 * severity it masked was only `normal`, so nothing was lost; the mechanism was
 * wrong all the same. A role name is declarable — 047's marker already names
 * `anadyon_audit` — so requiring it costs a marker author nothing and makes the
 * declaration say *who* was granted what, not merely *where*.
 *
 * **And a marker declares the *kinds* of change it makes.** Added 4 October
 * 2026, from Codex's second review: *"Markers need to identify the expected
 * change type, role and effect, rather than just an object name."* A marker for
 * a grant migration now lists `expected_kinds: ["grant"]` and cannot absorb a
 * column, a policy, an index or a definition on the same table — the W44 defect
 * made structurally impossible rather than narrowed. `expected_kinds` is
 * required by `validateExpectedChange`; it is honoured here when present so an
 * older marker keeps working rather than silently absorbing everything.
 */
export function explainWith(changes, markers = []) {
  const declarations = markers.map((marker) => ({
    names: (marker.expected_objects ?? []).map((object) => String(object).toLowerCase()),
    kinds:
      Array.isArray(marker.expected_kinds) && marker.expected_kinds.length > 0
        ? new Set(marker.expected_kinds.map((kind) => String(kind)))
        : null,
  }));

  return changes.map((change) => {
    if (change.severity === "critical") return change;
    const object = String(change.object ?? "").toLowerCase();

    for (const { names, kinds } of declarations) {
      const byproduct = BYPRODUCT_KINDS.has(change.kind);
      // **A declared kind binds every change, byproducts included.** The
      // byproduct rule exists because a marker's author cannot predict that
      // `create table x` also creates `x_pkey` — that is about the *name*, which
      // is why it only relaxes name matching to a child path below. The *kind*
      // is predictable: an author adding a constraint knows an index comes with
      // it and can write `indexes.missing`. Letting byproducts skip the kind
      // filter would have left the W44 hole open for exactly one shape — a
      // grant declaration absorbing a genuinely missing index on a table it
      // names — and on 4 October the only reason the missing
      // `quote_rate_limits_blocked_idx` survived the masking was that migration
      // 047's marker happens not to name that table.
      if (kinds && !kinds.has(change.kind)) continue;
      // Both halves of a grant, per the paragraph above.
      if (change.kind === "grant" && !names.includes(String(change.role ?? "").toLowerCase())) continue;
      const hit = names.find((name) => object === name || (byproduct && object.startsWith(`${name}.`)));
      if (hit) return { ...change, severity: "explained", explained_by: hit };
    }
    return change;
  });
}

/**
 * Every structural change kind this comparison can produce.
 *
 * Exported so a marker's `expected_kinds` can be checked against the real list
 * rather than against a guess — a marker declaring `grants` or `column_change`
 * would otherwise bind nothing and absorb nothing, and look like it had.
 * Row-count kinds are deliberately absent: a marker declares a schema change,
 * and rows falling is never one.
 */
export const CHANGE_KINDS = [
  "tables.added",
  "tables.missing",
  "views.added",
  "views.missing",
  "functions.added",
  "functions.missing",
  "table.rls_enabled",
  "table.rls_forced",
  "column",
  "grant",
  "grantees.added",
  "grantees.missing",
  "policy",
  "triggers.added",
  "triggers.missing",
  "indexes.added",
  "indexes.missing",
  "trigger.definition",
  "index.definition",
  "view.kind",
  "view.definition",
  "function.security_definer",
  "function.returns",
  "function.definition",
];

/**
 * The only kinds a table-level declaration may absorb on that table's children.
 *
 * **Narrowed 4 October 2026, after the mechanism's first real use muted a
 * genuine finding.** Migration 047 grants privileges on six tables, so its
 * marker names them — `quotes` among them. The old rule absorbed any change
 * whose object merely *started* with a declared name, so a declaration about
 * **grants** silenced twelve unrelated **column** differences: production's
 * `quotes.pickup_date` being `text` where the migrations say `date not null`,
 * and eleven more. They appeared in the report annotated
 * `declared as quotes` — explained by a migration that has nothing to do with
 * them, and not applied.
 *
 * That is the failure this whole design exists to prevent, running backwards. A
 * marker that cries wolf gets muted; **a marker that absorbs what it did not
 * cause makes the check lie**, which is worse, because the report still looks
 * attentive.
 *
 * So child matching now covers only the **mechanical byproducts** of creating an
 * object — the primary-key index nobody writing a marker would think to list.
 * A column, a policy or a grant on a child path is a deliberate, declarable
 * thing: if a migration changes one, its marker can name it. The substring rule
 * that also existed (`name.includes(object)`) is gone entirely; it was never
 * justified and could absorb almost anything.
 */
const BYPRODUCT_KINDS = new Set(["indexes.added", "indexes.missing", "triggers.added", "triggers.missing"]);

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
export function renderReport({
  changes,
  counts = [],
  at = new Date(),
  expectedDigest,
  actualDigest,
  markers = [],
  retired = [],
}) {
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
    ...(retired.length > 0
      ? [`${retired.length} marker(s) carried no weight tonight: ${retired.join("; ")}`]
      : []),
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
      "1. **Do not write a marker for this.** A declaration is committed *before* the"
        + " change is made; one written now would explain anything, including a change"
        + " nobody intended. Find out what happened first.",
      "2. If you made this change, the record that belongs here is the migration and its"
        + " paste copy, merged — and the open item saying it was applied. A marker is for"
        + " the window between declaring a migration and pasting it, never for an"
        + " explanation after the fact.",
      "3. If you did not make it, it was made through the dashboard or with a credential. Check the Supabase audit log for the window, and read the gate's decision log on each machine.",
      "4. A `critical` row is a customer-data exposure now, not a question: revoke the grant before anything else.",
      "",
    );
  }
  return lines.join("\n");
}
