/**
 * The parts of a Supabase database that PGlite has no notion of.
 *
 * PGlite is a real PostgreSQL, which is why the migration replay and several
 * tests can execute the migration chain against it rather than reading it. What
 * it is not is a Supabase *project*: there are no `anon`/`authenticated`/
 * `service_role` roles, no `storage` schema, and no `auth` schema — all three
 * created by Supabase's own platform migrations, not by anything in this repo.
 *
 * These stubs exist in one file, and are imported by both
 * `scripts/check-migration-replay.mjs` and the tests, deliberately.
 *
 * The alternative — each caller carrying its own copy — is the failure this
 * project has already paid for twice: a check that passes against a fixture the
 * real gate does not have. A migration that replays in a test and then breaks
 * CI, or the reverse, is worse than no check at all, because somebody trusts it.
 *
 * **These are stubs, not Supabase.** Column names and function bodies are
 * copied from Supabase's own definitions where one exists, so a migration that
 * works here has a fair chance of working there; nothing about them proves it
 * does. Anything that depends on Supabase's *behaviour* rather than its shape —
 * PostgREST populating request.jwt.claims, say — is not testable here and is
 * documented as such where it matters.
 */

/**
 * Roles, and the `storage.buckets` table migrations insert into.
 *
 * Roles are `nologin` because nothing connects as them; what matters is that
 * `grant`/`revoke` naming them resolves.
 */
export const ROLE_AND_STORAGE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    owner uuid,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

/**
 * The `auth` schema, to the extent this repository's migrations touch it.
 *
 * `auth.users` carries only the columns something here actually reads —
 * `raw_app_meta_data` for the role, `raw_user_meta_data` and `email` for the
 * name snapshot. Adding the rest of Supabase's real column list would be
 * inventing a fixture nobody checks against the original.
 *
 * `auth.uid()` is Supabase's own definition, reproduced exactly from
 * supabase/auth migration `20211202183645_update_auth_uid.up.sql` — including
 * the property that a *present but empty* claims setting makes it raise rather
 * than return NULL, because `''::jsonb` is not valid JSON. That is real
 * behaviour worth keeping in the stub; smoothing it over here would hide it
 * until production.
 */
export const AUTH_STUBS = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid() returns uuid
  language sql
  stable
  as $stub$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
      ),
      ''
    )::uuid
  $stub$;

  grant usage on schema auth to anon, authenticated, service_role;
`;

/** Everything a replay of the full migration chain needs. */
export const SUPABASE_COMPATIBILITY_STUBS =
  ROLE_AND_STORAGE_STUBS + AUTH_STUBS;
