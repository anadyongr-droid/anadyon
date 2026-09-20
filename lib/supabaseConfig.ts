const CREDENTIALLESS_PREVIEW_URL = "https://credentialless-preview.invalid";
const CREDENTIALLESS_PREVIEW_KEY = "credentialless-preview";

type Env = Readonly<Record<string, string | undefined>>;

export function resolveSupabaseRuntimeConfig(env: Env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (url && anon && service) return { url, anon, service, credentialless: false } as const;

  const generalPreview =
    env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF?.trim() !== "staging";
  if (generalPreview && !url && !anon && !service) {
    return {
      url: CREDENTIALLESS_PREVIEW_URL,
      anon: CREDENTIALLESS_PREVIEW_KEY,
      service: CREDENTIALLESS_PREVIEW_KEY,
      credentialless: true,
    } as const;
  }

  throw new Error(
    "Supabase configuration is incomplete; production and staging require URL, anon key and service-role key",
  );
}
