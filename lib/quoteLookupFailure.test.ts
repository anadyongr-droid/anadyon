import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.quote_rate_limits(ip text primary key, fail_count int not null default 0, blocked_until timestamptz, updated_at timestamptz not null default now());`);
  // Production/staging already carry a void-returning function. Replacing a
  // TABLE-returning prototype would fail against that actual signature.
  await db.exec(`create function public.record_quote_lookup_failure(p_ip text) returns void language plpgsql security definer set search_path = '' as $$
    begin
      if p_ip is null or length(p_ip)>256 then raise exception 'Invalid IP'; end if;
      insert into public.quote_rate_limits as q (ip,fail_count,blocked_until,updated_at) values(p_ip,1,null,now())
      on conflict(ip) do update set fail_count=q.fail_count+1,
      blocked_until=case when q.fail_count+1>=12 then greatest(coalesce(q.blocked_until,now()),now()+interval '24 hours')
        when q.fail_count+1>=8 then greatest(coalesce(q.blocked_until,now()),now()+interval '1 hour')
        when q.fail_count+1>=5 then greatest(coalesce(q.blocked_until,now()),now()+interval '10 minutes')
        when q.fail_count+1>=3 then greatest(coalesce(q.blocked_until,now()),now()+interval '30 seconds') else q.blocked_until end,updated_at=now();
    end $$;`);
  await db.exec(readFileSync("supabase/migrations/20261116120000_record_quote_lookup_failure.sql", "utf8"));
});
afterAll(() => db.close());
beforeEach(async () => { await db.exec("delete from public.quote_rate_limits"); });
async function fail(ip: string | null = "test") { await db.query("select public.record_quote_lookup_failure($1)", [ip]); }
async function row(ip = "test") { return (await db.query<{ fail_count: number; seconds: number | null }>("select fail_count,extract(epoch from blocked_until-now())::float8 as seconds from public.quote_rate_limits where ip=$1", [ip])).rows[0]; }
it("keeps the thresholds and counts failures after each block expires", async () => {
  for (let count = 1; count <= 12; count++) {
    await db.exec("update public.quote_rate_limits set blocked_until=now()-interval '1 second'");
    await fail();
    const result = await row();
    expect(result.fail_count).toBe(count);
    const duration = count >= 12 ? 86400 : count >= 8 ? 3600 : count >= 5 ? 600 : count >= 3 ? 30 : null;
    if (duration === null) expect(result.seconds).toBeNull();
    else { expect(result.seconds).toBeGreaterThan(duration-2); expect(result.seconds).toBeLessThanOrEqual(duration+1); }
  }
});
it("does not count, extend, or refresh idle memory during an active block", async () => {
  await db.exec("insert into public.quote_rate_limits values ('test',3,now()+interval '20 seconds',now()-interval '10 seconds')");
  const before = (await db.query("select * from public.quote_rate_limits")).rows;
  await Promise.all(Array.from({ length: 8 }, () => fail()));
  expect((await db.query("select * from public.quote_rate_limits")).rows).toEqual(before);
});
it("resets failures after more than 24 hours of inactivity", async () => {
  await db.exec("insert into public.quote_rate_limits values ('test',12,now()-interval '1 hour',now()-interval '25 hours')");
  await fail();
  expect(await row()).toEqual({ fail_count: 1, seconds: null });
});
it("does not reset a recent history", async () => {
  await db.exec("insert into public.quote_rate_limits values ('test',4,null,now()-interval '23 hours')");
  await fail();
  expect((await row()).fail_count).toBe(5);
});
it("maps absent or blank addresses to unknown and preserves valid keys", async () => {
  await fail(null); await fail("");
  expect((await row("unknown")).fail_count).toBe(2);
  await fail("2001:db8::1");
  expect((await row("2001:db8::1")).fail_count).toBe(1);
});
it("permits service_role and denies anon/authenticated execution", async () => {
  const result = await db.query("select has_function_privilege('anon','public.record_quote_lookup_failure(text)','execute') as anon,has_function_privilege('authenticated','public.record_quote_lookup_failure(text)','execute') as authenticated,has_function_privilege('service_role','public.record_quote_lookup_failure(text)','execute') as service");
  expect(result.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(fail()).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
});
it("preserves the existing void signature and can be applied twice", async () => {
  await db.exec(readFileSync("supabase/migrations/20261116120000_record_quote_lookup_failure.sql", "utf8"));
  const result = await db.query("select prorettype::regtype::text as type,prosecdef,proconfig from pg_proc where oid='public.record_quote_lookup_failure(text)'::regprocedure");
  expect(result.rows[0]).toEqual({ type: "void", prosecdef: true, proconfig: ['search_path=""'] });
});
