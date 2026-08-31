import { readFileSync } from "node:fs";

export function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
        .filter(Boolean)
        .map((match) => [
          match[1],
          match[2].trim().replace(/^(["'])(.*)\1$/, "$2"),
        ]),
    );
  } catch {
    return {};
  }
}

/**
 * Destructive staging commands must prove their target three independent ways:
 * the API host, the database URL, and a human-entered acknowledgement.
 */
export function validateStagingTarget(env, production = {}) {
  const required = [
    "STAGING_SUPABASE_PROJECT_REF",
    "STAGING_NEXT_PUBLIC_SUPABASE_URL",
    "STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "STAGING_SUPABASE_DB_URL",
    "STAGING_ADMIN_PASSWORD",
    "STAGING_STAFF_PASSWORD",
    "CONFIRM_STAGING_RESET",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing staging configuration: ${missing.join(", ")}`);
  }

  const ref = env.STAGING_SUPABASE_PROJECT_REF.trim();
  if (!/^[a-z0-9]{10,40}$/.test(ref)) {
    throw new Error("STAGING_SUPABASE_PROJECT_REF has an unexpected format");
  }

  const api = new URL(env.STAGING_NEXT_PUBLIC_SUPABASE_URL);
  if (api.protocol !== "https:" || api.hostname !== `${ref}.supabase.co`) {
    throw new Error("The staging API URL does not exactly match the staging project ref");
  }

  const database = new URL(env.STAGING_SUPABASE_DB_URL);
  if (!/^postgres(?:ql)?:$/.test(database.protocol)) {
    throw new Error("STAGING_SUPABASE_DB_URL must be a PostgreSQL connection URL");
  }
  let databasePassword;
  try {
    databasePassword = decodeURIComponent(database.password);
  } catch {
    throw new Error("The staging database password must be percent-encoded in STAGING_SUPABASE_DB_URL");
  }
  if (!databasePassword || /REPLACE_WITH_|\[YOUR-PASSWORD\]/i.test(databasePassword)) {
    throw new Error("Replace the database-password placeholder in STAGING_SUPABASE_DB_URL");
  }
  const databaseNamesRef =
    database.hostname === `db.${ref}.supabase.co` ||
    decodeURIComponent(database.username).endsWith(`.${ref}`);
  if (!databaseNamesRef) {
    throw new Error("The staging database URL does not name the staging project ref");
  }

  if (env.CONFIRM_STAGING_RESET !== `reset-${ref}`) {
    throw new Error(`Set CONFIRM_STAGING_RESET=reset-${ref} for this destructive reset`);
  }

  const productionUrl = production.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const productionServiceKey = production.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const productionDbUrl = production.SUPABASE_DB_URL?.trim();
  if (
    (productionUrl && productionUrl === env.STAGING_NEXT_PUBLIC_SUPABASE_URL.trim()) ||
    (productionServiceKey && productionServiceKey === env.STAGING_SUPABASE_SERVICE_ROLE_KEY.trim()) ||
    (productionDbUrl && productionDbUrl === env.STAGING_SUPABASE_DB_URL.trim())
  ) {
    throw new Error("Refusing reset: at least one staging credential equals production");
  }

  return { ref, apiUrl: api.origin, dbUrl: env.STAGING_SUPABASE_DB_URL.trim() };
}
