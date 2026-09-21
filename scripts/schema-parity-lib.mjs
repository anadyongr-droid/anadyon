const REDACTED_DATABASE_URL = "[REDACTED_DATABASE_URL]";

/** Remove database credentials from any diagnostic before it reaches output. */
export const REDACTED_DATABASE_PASSWORD = "[REDACTED_DATABASE_PASSWORD]";

/**
 * The password out of a connection URL, raw and percent-decoded.
 *
 * Whole-URL replacement covers the URL as it was passed in, and the patterns
 * below cover anything URL-shaped. Neither covers the password on its own —
 * and the password is the part that matters. Two cases produce it detached
 * from its URL:
 *
 * - output wrapped across a line, so the URL no longer matches as one string
 *   and the pattern stops at the newline, leaving the tail in the clear;
 * - a driver reporting `password=...` in libpq keyword form rather than as a
 *   URL, which no URL-shaped pattern can see.
 *
 * Both forms are redacted because the password is already in hand: it came in
 * with `knownUrls`. Decoded as well as raw, since a URL carries `%40` where
 * the driver prints `@`.
 *
 * Short values are skipped. A six-character floor keeps a password that
 * happens to read like an ordinary word from blanking unrelated log text; a
 * credential short enough to be caught by that floor has a worse problem than
 * its logging.
 */
const MIN_REDACTABLE_SECRET = 6;

function passwordTokens(url) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^:@/\s]+:([^@\s]+)@/i.exec(url);
  if (!match) return [];
  const raw = match[1];
  const tokens = new Set([raw]);
  try {
    tokens.add(decodeURIComponent(raw));
  } catch {
    // A malformed escape is not a reason to skip the raw form.
  }
  return [...tokens].filter((token) => token.length >= MIN_REDACTABLE_SECRET);
}

export function redactDatabaseCredentials(value, knownUrls = []) {
  let redacted = String(value ?? "");
  const secrets = knownUrls
    .filter((url) => typeof url === "string" && url.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, REDACTED_DATABASE_URL);
  }

  // Longest first, so a password that contains another is not half-replaced.
  const passwords = [...new Set(secrets.flatMap(passwordTokens))]
    .sort((a, b) => b.length - a.length);
  for (const password of passwords) {
    redacted = redacted.replaceAll(password, REDACTED_DATABASE_PASSWORD);
  }

  // Cover malformed schemes too: third-party parsers may partially normalise
  // a pasted URL before returning it, defeating exact-value replacement.
  redacted = redacted.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`:@/]+:[^@\s'"`]+@[^\s'"`]+/gi,
    REDACTED_DATABASE_URL,
  );

  // Defence in depth: redact PostgreSQL URLs the caller did not know about.
  return redacted.replace(
    /\bpostgres(?:ql)?:\/\/[^\s'"`]+/gi,
    REDACTED_DATABASE_URL,
  );
}

/** Build a useful child-process failure without reproducing argv or secrets. */
/**
 * What is structurally wrong with a connection URL, without revealing it.
 *
 * "failed to parse connection string" tells us the CLI rejected the value and
 * nothing else, and the value is a secret nobody can read back — so diagnosing
 * it has meant guessing. On 20 September the guess was percent-encoding; the
 * password turned out to have no special characters, and the guess had cost a
 * round trip.
 *
 * Every line this produces is a boolean, a count or a fixed label. No part of
 * the value is ever echoed — not the password, not the host, not the project
 * ref — and `lib/dbUrlShape.test.ts` asserts that against a URL built from
 * distinctive markers.
 */
export function describeDatabaseUrlShape(raw) {
  const out = [];
  const say = (label, value) => out.push(`  ${label}: ${value}`);

  if (typeof raw !== "string" || raw.length === 0) {
    return ["  present: no"];
  }

  const value = raw.trim();
  say("present", "yes");
  say("length", String(raw.length));
  say("surrounding whitespace", raw === value ? "no" : "YES — trim it");
  say("whitespace inside", /\s/.test(value) ? "YES — a line break or space is in the value" : "no");
  say("wrapping quotes", /^["'].*["']$/s.test(value) ? "YES — remove them" : "no");
  say("starts with psql", value.startsWith("psql ") ? "YES — copy the URI, not the psql command" : "no");
  say(
    "unreplaced placeholder",
    /\[|\]/.test(value) ? "YES — [YOUR-PASSWORD] brackets are still present" : "no",
  );
  // The scheme is a protocol token from a fixed vocabulary, not secret, so an
  // unexpected one is named outright. "MISSING or wrong" identified the fault
  // on 21 September but not which fault, which cost another round trip.
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(value);
  const scheme = schemeMatch?.[1];
  say(
    "scheme",
    /^postgres(ql)?$/i.test(scheme ?? "")
      ? `${scheme}:// — correct`
      : scheme
        ? `"${scheme}://" — WRONG, expected postgresql:// or postgres://`
        : "MISSING — the value does not begin with a scheme",
  );
  say("@ count", String((value.match(/@/g) ?? []).length) + " (expected 1)");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    say("parses as a URL", "NO — this is what the CLI is rejecting");
    return out;
  }
  say("parses as a URL", "yes");
  say("username present", parsed.username ? "yes" : "NO");
  say("password present", parsed.password ? `yes (${parsed.password.length} characters)` : "NO");
  if (parsed.password) {
    say(
      "password characters",
      /^[A-Za-z0-9]+$/.test(parsed.password)
        ? "letters and digits only"
        : "contains characters that must be percent-encoded",
    );
  }
  const host = parsed.hostname;
  say(
    "host",
    host.endsWith(".supabase.co")
      ? "a supabase.co direct host"
      : host.endsWith(".supabase.com")
        ? "a supabase.com pooler host"
        : "NOT a Supabase host",
  );
  say("port", parsed.port || "MISSING");
  say("database path", parsed.pathname === "/postgres" ? "/postgres" : `unexpected (${parsed.pathname.length} characters)`);
  return out;
}

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
