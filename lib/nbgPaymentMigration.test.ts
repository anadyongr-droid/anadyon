import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("applies migration 031 with atomic, replay-safe NBG deposit completion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      -- Supabase's service_role has BYPASSRLS; mirror that property so this
      -- test exercises the same invoker-rights path as the deployed route.
      create role service_role nologin bypassrls;

      create table public.reservations (
        id uuid primary key default gen_random_uuid(),
        deposit numeric(10,2) not null,
        deposit_paid_at timestamptz,
        status text not null default 'pending',
        updated_at timestamptz not null default now()
      );
      grant all on table public.reservations to service_role;

      create or replace function public.set_updated_at()
      returns trigger language plpgsql security invoker set search_path = public as $$
      begin new.updated_at := now(); return new; end;
      $$;
      grant execute on function public.set_updated_at() to service_role;
    `);

    const numbered = await readFile(
      join(process.cwd(), "supabase/migrations/20260822180000_nbg_payment_attempts.sql"),
      "utf8",
    );
    const paste = await readFile(
      join(process.cwd(), "supabase/migrations/paste/031_nbg_payment_attempts_paste.sql"),
      "utf8",
    );
    await db.exec(numbered);
    await db.exec(paste);

    const reservation = await db.query<{ id: string }>(`
      insert into public.reservations(deposit, status)
      values (112.26, 'pending') returning id
    `);
    const reservationId = reservation.rows[0].id;
    const attempt = await db.query<{ id: string }>(`
      insert into public.payment_attempts(
        reservation_id, provider, environment, external_order_id, amount, status
      ) values ($1, 'nbg', 'test', 'AN-TEST-ORDER-1', 112.26, 'pending') returning id
    `, [reservationId]);
    const attemptId = attempt.rows[0].id;

    await db.exec("set role service_role");
    const first = await db.query<{ reservation_id: string; applied: boolean; amount: string }>(`
      select * from public.complete_nbg_deposit_payment($1, 'SUCCESS', '2026-08-22T10:00:00Z')
    `, [attemptId]);
    const replay = await db.query<{ applied: boolean }>(`
      select applied from public.complete_nbg_deposit_payment($1, 'SUCCESS', '2026-08-22T10:01:00Z')
    `, [attemptId]);
    await db.exec("reset role");

    expect(first.rows[0]).toEqual({ reservation_id: reservationId, applied: true, amount: "112.26" });
    expect(replay.rows[0].applied).toBe(false);
    const stored = await db.query<{ status: string; deposit_paid_at: string }>(`
      select status,
             to_char(deposit_paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as deposit_paid_at
        from public.reservations where id=$1
    `, [reservationId]);
    expect(stored.rows[0]).toEqual({
      status: "confirmed",
      deposit_paid_at: "2026-08-22T10:00:00Z",
    });

    const mismatchReservation = await db.query<{ id: string }>(`
      insert into public.reservations(deposit, status) values (50, 'pending') returning id
    `);
    const mismatchAttempt = await db.query<{ id: string }>(`
      insert into public.payment_attempts(
        reservation_id, provider, environment, external_order_id, amount, status
      ) values ($1, 'nbg', 'test', 'AN-TEST-ORDER-2', 40, 'pending') returning id
    `, [mismatchReservation.rows[0].id]);

    await db.exec("set role service_role");
    await expect(db.query(
      "select * from public.complete_nbg_deposit_payment($1, 'SUCCESS', now())",
      [mismatchAttempt.rows[0].id],
    )).rejects.toThrow(/amount does not match/);
    await db.exec("reset role");

    const mismatchStored = await db.query<{ attempt_status: string; reservation_status: string }>(`
      select p.status as attempt_status, r.status as reservation_status
        from public.payment_attempts p
        join public.reservations r on r.id = p.reservation_id
       where p.id = $1
    `, [mismatchAttempt.rows[0].id]);
    expect(mismatchStored.rows[0]).toEqual({
      attempt_status: "pending",
      reservation_status: "pending",
    });

    const privileges = await db.query<{
      anon_execute: boolean;
      authenticated_execute: boolean;
      service_execute: boolean;
      anon_select: boolean;
    }>(`
      select
        has_function_privilege('anon', 'public.complete_nbg_deposit_payment(uuid,text,timestamptz)', 'execute') as anon_execute,
        has_function_privilege('authenticated', 'public.complete_nbg_deposit_payment(uuid,text,timestamptz)', 'execute') as authenticated_execute,
        has_function_privilege('service_role', 'public.complete_nbg_deposit_payment(uuid,text,timestamptz)', 'execute') as service_execute,
        has_table_privilege('anon', 'public.payment_attempts', 'select') as anon_select
    `);
    expect(privileges.rows[0]).toEqual({
      anon_execute: false,
      authenticated_execute: false,
      service_execute: true,
      anon_select: false,
    });

    const functionSecurity = await db.query<{ security_definer: boolean; config: string[] }>(`
      select p.prosecdef as security_definer, p.proconfig as config
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='complete_nbg_deposit_payment'
    `);
    expect(functionSecurity.rows[0]).toEqual({
      security_definer: false,
      config: ["search_path=public, pg_temp"],
    });
  } finally {
    await db.close();
  }
}, 20_000);
