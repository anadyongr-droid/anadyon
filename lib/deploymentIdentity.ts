export interface DeploymentIdentity {
  commit: string;
  environment: string;
  supabaseProjectRef: string;
}

/**
 * Returns only non-secret deployment coordinates.
 *
 * The Supabase URL is deliberately reduced to its project ref. Never return
 * the URL itself: it is configuration rather than identity, and keeping this
 * helper narrow makes it harder for a future edit to turn a diagnostic into a
 * configuration dump.
 */
export function deploymentIdentity(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DeploymentIdentity {
  let supabaseProjectRef = "unavailable";

  try {
    const hostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    const [candidate, ...rest] = hostname.split(".");
    if (candidate && rest.join(".") === "supabase.co") {
      supabaseProjectRef = candidate;
    }
  } catch {
    // A missing or malformed URL is itself useful diagnostic information.
  }

  return {
    commit: env.VERCEL_GIT_COMMIT_SHA ?? "unavailable",
    environment: env.VERCEL_ENV ?? "local",
    supabaseProjectRef,
  };
}
