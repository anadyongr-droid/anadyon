const REDACTED_DATABASE_URL = "[REDACTED_DATABASE_URL]";

/** Remove database credentials from any diagnostic before it reaches output. */
export function redactDatabaseCredentials(value, knownUrls = []) {
  let redacted = String(value ?? "");
  const secrets = knownUrls
    .filter((url) => typeof url === "string" && url.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, REDACTED_DATABASE_URL);
  }

  // Defence in depth: redact PostgreSQL URLs the caller did not know about.
  return redacted.replace(
    /\bpostgres(?:ql)?:\/\/[^\s'"`]+/gi,
    REDACTED_DATABASE_URL,
  );
}

/** Build a useful child-process failure without reproducing argv or secrets. */
export function schemaDumpFailureMessage(label, result, knownUrls = []) {
  const detail = [result?.error?.message, result?.stderr, result?.stdout]
    .filter(Boolean)
    .map((part) => redactDatabaseCredentials(part, knownUrls).trim())
    .filter(Boolean)
    .join("\n");

  return `${label} schema dump failed.${detail ? `\n${detail}` : ""}`;
}

/** Split a pg_dump into complete top-level SQL statements. */
export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let single = false;
  let double = false;
  let dollar = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (single) {
      if (char === "'" && sql[i + 1] === "'") i += 1;
      else if (char === "'") single = false;
      continue;
    }
    if (double) {
      if (char === '"' && sql[i + 1] === '"') i += 1;
      else if (char === '"') double = false;
      continue;
    }
    if (char === "'") {
      single = true;
      continue;
    }
    if (char === '"') {
      double = true;
      continue;
    }
    if (char === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollar = match[0];
        i += dollar.length - 1;
        continue;
      }
    }
    if (char === ";") {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

export function canonicalDump(sql) {
  return sql
    .split("\n")
    .filter((line) =>
      line.trim() &&
      !line.startsWith("--") &&
      !line.startsWith("SET ") &&
      !line.startsWith("SELECT pg_catalog.set_config") &&
      !line.startsWith("\\restrict") &&
      !line.startsWith("\\unrestrict"),
    )
    .join("\n");
}

function compileManifest(manifest) {
  return manifest.pendingMigrations.flatMap((migration) =>
    (migration.stagingOnlyStatementPatterns ?? []).map((source) => ({
      id: migration.id,
      source,
      regex: new RegExp(source, "i"),
    })),
  );
}

export function classifySchemaDifference(productionSql, stagingSql, manifest) {
  const production = new Set(splitSqlStatements(canonicalDump(productionSql)));
  const staging = new Set(splitSqlStatements(canonicalDump(stagingSql)));
  const onlyProduction = [...production].filter((statement) => !staging.has(statement));
  const onlyStaging = [...staging].filter((statement) => !production.has(statement));
  const rules = compileManifest(manifest);
  const matchedRuleIds = new Set();
  const expectedStaging = [];
  const unexpectedStaging = [];

  for (const statement of onlyStaging) {
    const rule = rules.find(({ regex }) => regex.test(statement));
    if (rule) {
      matchedRuleIds.add(rule.id);
      expectedStaging.push({ migration: rule.id, statement });
    } else {
      unexpectedStaging.push(statement);
    }
  }

  const missingRequired = manifest.pendingMigrations
    .filter((migration) => migration.required && !matchedRuleIds.has(migration.id))
    .map((migration) => migration.id);

  return {
    onlyProduction,
    expectedStaging,
    unexpectedStaging,
    missingRequired,
    ok: onlyProduction.length === 0 && unexpectedStaging.length === 0 && missingRequired.length === 0,
  };
}
