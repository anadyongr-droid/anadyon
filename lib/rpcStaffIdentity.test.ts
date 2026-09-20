import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Diagnostic 10c's first half, run against real Postgres instead of assumed.
 *
 * `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` §12.4 leaves phase 2's
 * finalisation blocked on one untested sentence:
 *
 *   > This rests on one assumption that has not been tested and must be before
 *   > any of it is built: that `auth.uid()` resolves inside a `SECURITY
 *   > DEFINER` function when the call arrives from a user-scoped client. It
 *   > should — PostgREST sets the JWT claims per request and `auth.uid()` reads
 *   > them, independently of which role the function body executes as — but
 *   > "should" is what this whole document exists to stop relying on.
 *
 * That assumption is two claims wearing one coat, and they have different
 * owners:
 *
 *   **(a) Postgres.** A request-scoped GUC survives `SECURITY DEFINER`, and
 *        `SET search_path = ''` does not disturb it. This is PostgreSQL
 *        semantics, and PGlite is a real PostgreSQL, so it can be settled here
 *        — today, without touching production and without an agent applying a
 *        migration, which `AGENTS.md` forbids.
 *
 *   **(b) PostgREST.** It populates `request.jwt.claims` for a request carrying
 *        a user's access token. **This file cannot test that**, because there is
 *        no PostgREST here. It stays with 10c against the live project.
 *
 * Splitting them is the point. If (a) were false the design would be dead and
 * no amount of production diagnostics would revive it; separating the two means
 * the remaining production step is a single narrow question about one vendor's
 * documented behaviour rather than an open-ended "does this work at all".
 *
 * `auth.uid()` below is Supabase's own definition, not a paraphrase — from
 * supabase/auth migration 20211202183645_update_auth_uid.up.sql.
 */

/**
 * Enough of a Supabase-shaped database to ask the question, and no more.
 *
 * Three roles because the claim under test is precisely that *identity* and
 * *privilege* move independently: `authenticated` is who calls, `fn_owner` is
 * who the body runs as, and the split has to be observable or the test proves
 * nothing.
 */
const BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create role fn_owner nologin;

  create schema auth;
  grant usage on schema auth to authenticated, anon, service_role, fn_owner;

  -- Supabase's definition, reproduced exactly.
  create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
      ),
      ''
    )::uuid
  $$;

  -- The staff roster the gateway is supposed to check against: database-held
  -- membership, per §2, never a JWT claim.
  create table public.staff_members (
    user_id uuid primary key,
    active  boolean not null default true
  );

  -- Something only the owner may read, so "privilege changed" is a fact the
  -- test can observe rather than a claim it makes.
  create table public.owner_only (secret text not null);
  insert into public.owner_only values ('the counter schema');
  revoke all on public.owner_only from public;
  alter table public.owner_only owner to fn_owner;
  alter table public.staff_members owner to fn_owner;
  revoke all on public.staff_members from public;
`;

/** A staff member, and somebody who merely holds an account. */
const STAFF = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

/**
 * The two functions under test, written the way §4.2 rule 6 says a real one
 * would be: SECURITY DEFINER, `SET search_path = ''`, every object qualified.
 */
const FUNCTIONS = `
  -- What the caller looks like from inside a definer function.
  create or replace function public.whoami_probe()
  returns table (uid uuid, pg_role text, secret text)
  language sql
  security definer
  set search_path = ''
  as $$
    select auth.uid(), current_user::text, (select o.secret from public.owner_only o limit 1)
  $$;
  alter function public.whoami_probe() owner to fn_owner;
  revoke all on function public.whoami_probe() from public;
  grant execute on function public.whoami_probe() to authenticated;

  -- The same thing without SET search_path, to isolate whether that clause is
  -- what disturbs the claims. It is the one part of the pattern this project
  -- adds on top of a plain definer function, so it is the one to rule out.
  create or replace function public.whoami_no_searchpath()
  returns uuid
  language sql
  security definer
  as $$ select auth.uid() $$;
  alter function public.whoami_no_searchpath() owner to fn_owner;
  revoke all on function public.whoami_no_searchpath() from public;
  grant execute on function public.whoami_no_searchpath() to authenticated;

  -- The §2 gateway itself: verify the caller against database-held membership,
  -- then do the privileged work. Refusing is the interesting half.
  create or replace function public.staff_gateway()
  returns text
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    caller uuid := auth.uid();
  begin
    if caller is null then
      raise exception 'no caller identity' using errcode = '28000';
    end if;
    if not exists (
      select 1 from public.staff_members m where m.user_id = caller and m.active
    ) then
      raise exception 'not a staff member' using errcode = '42501';
    end if;
    return (select o.secret from public.owner_only o limit 1);
  end
  $$;
  alter function public.staff_gateway() owner to fn_owner;
  revoke all on function public.staff_gateway() from public;
  grant execute on function public.staff_gateway() to authenticated;

  -- The same gateway, granted more widely.
  --
  -- Not what anyone would deploy — §4.2 rule 6 says EXECUTE is granted only to
  -- the role that needs it — but without it the service-role tests below never
  -- reach the function body, and "refused" would prove only that the grant
  -- works. This isolates the identity check as the thing being tested, and the
  -- narrow twin above then shows the grant refusing first.
  create or replace function public.staff_gateway_wide()
  returns text
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    caller uuid := auth.uid();
  begin
    if caller is null then
      raise exception 'no caller identity' using errcode = '28000';
    end if;
    if not exists (
      select 1 from public.staff_members m where m.user_id = caller and m.active
    ) then
      raise exception 'not a staff member' using errcode = '42501';
    end if;
    return (select o.secret from public.owner_only o limit 1);
  end
  $$;
  alter function public.staff_gateway_wide() owner to fn_owner;
  revoke all on function public.staff_gateway_wide() from public;
  grant execute on function public.staff_gateway_wide() to authenticated, service_role;

  create or replace function public.whoami_probe_wide()
  returns table (uid uuid, pg_role text)
  language sql
  security definer
  set search_path = ''
  as $$ select auth.uid(), current_user::text $$;
  alter function public.whoami_probe_wide() owner to fn_owner;
  revoke all on function public.whoami_probe_wide() from public;
  grant execute on function public.whoami_probe_wide() to authenticated, service_role;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(FUNCTIONS);
  await db.exec(`insert into public.staff_members (user_id) values ('${STAFF}');`);
});

/**
 * One call, as PostgREST would make it.
 *
 * PostgREST sets the decoded claims and switches to the JWT's role for the
 * duration of the request, then resets. `set_config(..., true)` is
 * transaction-local, which is the same lifetime, so the shape is honest rather
 * than convenient. Passing `claims: null` is the service-role case — the
 * request carries no end user, and nothing is set.
 */
async function asRequest<T>(
  claims: Record<string, unknown> | string,
  sql: string,
  role = "authenticated",
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      typeof claims === "string" ? claims : JSON.stringify(claims),
    ]);
    await tx.exec(`set local role ${role}`);
    const res = await tx.query<T>(sql);
    return res.rows;
  }) as Promise<T[]>;
}

/**
 * What PostgREST sets for a request bearing the service-role key.
 *
 * Claims are still populated — the JWT is real and carries `role` — there is
 * simply no `sub`, because no end user authorised it. That, not an absent GUC,
 * is why `auth.uid()` is NULL on every existing `.rpc()` call site.
 */
const SERVICE_ROLE_CLAIMS = { role: "service_role", iss: "supabase" };

describe("(a) the Postgres half of the assumption", () => {
  it("keeps the caller's identity while changing the executing role", async () => {
    const [row] = await asRequest<{ uid: string; pg_role: string; secret: string }>(
      { sub: STAFF, role: "authenticated" },
      "select * from public.whoami_probe()",
    );

    // Identity survived the SECURITY DEFINER boundary...
    expect(row.uid).toBe(STAFF);
    // ...while privilege did not: the body ran as the owner, not the caller.
    expect(row.pg_role).toBe("fn_owner");
    // And that is not a label — it read a table `authenticated` cannot.
    expect(row.secret).toBe("the counter schema");
  });

  it("confirms the caller really lacks that privilege outside the function", async () => {
    // Without this, the row above proves nothing: a table everyone can read
    // would give the same answer whatever role the body executed as.
    await expect(
      asRequest({ sub: STAFF, role: "authenticated" }, "select secret from public.owner_only"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("is unaffected by `SET search_path = ''`", async () => {
    // The specific worry worth ruling out: search_path is the one part of the
    // execution context this project deliberately resets, so it is the obvious
    // suspect if the claims were to go missing. They do not — a GUC set for the
    // request is not schema resolution.
    const [withClause] = await asRequest<{ uid: string }>(
      { sub: STAFF, role: "authenticated" },
      "select uid from public.whoami_probe()",
    );
    const [without] = await asRequest<{ whoami_no_searchpath: string }>(
      { sub: STAFF, role: "authenticated" },
      "select public.whoami_no_searchpath()",
    );
    expect(withClause.uid).toBe(STAFF);
    expect(without.whoami_no_searchpath).toBe(STAFF);
  });
});

describe("(b) the service-role case the design has to survive", () => {
  it("resolves no identity at all when the request carries no end user", async () => {
    // This is the failure §3 of the open question describes: every existing
    // .rpc() call site uses supabaseAdmin, no claims are set, and auth.uid()
    // is NULL. Reproduced here so the gateway's behaviour under it is tested
    // rather than reasoned about.
    const [row] = await asRequest<{ uid: string | null; pg_role: string }>(
      SERVICE_ROLE_CLAIMS,
      "select uid, pg_role from public.whoami_probe_wide()",
      "service_role",
    );
    expect(row.uid).toBeNull();
    expect(row.pg_role).toBe("fn_owner");
  });
});

describe("the gateway pattern, end to end", () => {
  it("admits a staff member", async () => {
    const [row] = await asRequest<{ staff_gateway: string }>(
      { sub: STAFF, role: "authenticated" },
      "select public.staff_gateway()",
    );
    expect(row.staff_gateway).toBe("the counter schema");
  });

  it("refuses an authenticated stranger", async () => {
    // Holding an account is not membership. Signup is enabled on the project
    // and the anon key ships in every visitor's bundle, so this is the case
    // that matters most.
    await expect(
      asRequest({ sub: STRANGER, role: "authenticated" }, "select public.staff_gateway()"),
    ).rejects.toThrow(/not a staff member/);
  });

  it("refuses a staff member whose membership was withdrawn", async () => {
    await db.exec(`update public.staff_members set active = false where user_id = '${STAFF}';`);
    try {
      await expect(
        asRequest({ sub: STAFF, role: "authenticated" }, "select public.staff_gateway()"),
      ).rejects.toThrow(/not a staff member/);
    } finally {
      await db.exec(`update public.staff_members set active = true where user_id = '${STAFF}';`);
    }
  });

  it("fails closed under the service role, at the identity check", async () => {
    // The dangerous version §3 warns about is a gateway written permissively
    // enough that a NULL caller passes. This one raises, which is why the move
    // to a user-scoped client has to be complete for the routes it covers: a
    // half-migrated route does not silently keep working.
    await expect(
      asRequest(SERVICE_ROLE_CLAIMS, "select public.staff_gateway_wide()", "service_role"),
    ).rejects.toThrow(/no caller identity/);
  });

  it("raises rather than returning NULL when the claims GUC is empty", async () => {
    // Found by this suite failing, and it is Supabase's own auth.uid() doing
    // it: the definition ends in `::uuid` applied to
    // `current_setting('request.jwt.claims', true)::jsonb ->> 'sub'`, and an
    // empty string is not valid JSON. So a *defined but empty* GUC does not
    // give NULL — it throws `invalid input syntax for type json`.
    //
    // A custom GUC reverts to '' rather than to unset once a transaction that
    // set it ends, so this state is reachable on a pooled connection, not
    // hypothetical. It still fails closed, but as a 500 rather than a clean
    // refusal, and a gateway that means to answer "not a staff member" should
    // not answer "internal error" instead. Worth knowing before writing one.
    await expect(
      asRequest("", "select public.staff_gateway_wide()", "service_role"),
    ).rejects.toThrow(/invalid input syntax for type json/);
  });

  it("fails closed one layer earlier when EXECUTE was never granted", async () => {
    // Found by this test suite failing, not by design: with the grant written
    // the way §4.2 rule 6 says to write it, a service-role call is refused at
    // the grant and never reaches the identity check at all.
    //
    // Worth pinning, because it changes what a migration looks like. The two
    // layers are independent — a later `grant execute ... to service_role`,
    // added to make something else work, silently removes this one and leaves
    // only the identity check standing. Both are asserted so neither can be
    // mistaken for the other.
    await expect(
      asRequest(SERVICE_ROLE_CLAIMS, "select public.staff_gateway()", "service_role"),
    ).rejects.toThrow(/permission denied for function/);
  });
});
