import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

interface BookingResult {
  ref: string;
  promo_id: string | null;
  discount: number;
  total: number;
  deposit: number;
  balance_due: number;
  idempotent_replay: boolean;
}

const reservation = {
  customer_name: "Test Customer",
  pickup_date: "2026-08-21",
  return_date: "2026-08-22",
  rental_days: 1,
  daily_rate: 100,
  vehicle_subtotal: 100,
  total: 100,
  deposit: 30,
  balance_due: 70,
};

it("executes migration 024 atomically with defaults, promos, replay and least privilege", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;

      create table public.promo_codes (
        id uuid primary key default gen_random_uuid(),
        code text not null unique,
        type text not null,
        value numeric not null,
        active boolean not null default true,
        expires_at date,
        max_uses integer,
        used_count integer not null default 0
      );
      create table public.quotes (
        id uuid primary key default gen_random_uuid(),
        ref text not null unique,
        total numeric(10,2),
        deposit numeric(10,2),
        balance_due numeric(10,2),
        discount_amount numeric default 0,
        idempotency_key text unique,
        created_at timestamptz default now()
      );
      create table public.reservations (
        id uuid primary key default gen_random_uuid(),
        customer_name text not null,
        pickup_date date not null,
        return_date date not null,
        rental_days integer not null,
        daily_rate numeric(10,2) not null,
        vehicle_subtotal numeric(10,2) not null,
        total numeric(10,2) not null,
        deposit numeric(10,2) not null,
        balance_due numeric(10,2) not null,
        promo_code_id uuid references public.promo_codes(id),
        discount_amount numeric default 0,
        discount_reason text,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      -- The broken migration-022 signature must be replaced, not overloaded.
      create function public.create_web_booking(
        p_quote jsonb,
        p_reservation jsonb,
        p_promo_code text default null,
        p_idempotency_key text default null
      ) returns jsonb language sql as $$ select '{}'::jsonb $$;

      insert into public.promo_codes(code, type, value, max_uses)
      values ('SAVE10', 'percentage', 10, 10),
             ('EXHAUSTED', 'percentage', 20, 0),
             ('TOOBIG', 'fixed', 150, 1),
             ('ONCE', 'fixed', 15, 1);
    `);

    const migration = await readFile(
      join(process.cwd(), "supabase/migrations/024_fix_create_web_booking_defaults.sql"),
      "utf8"
    );
    const pasteMigration = await readFile(
      join(process.cwd(), "supabase/migrations/paste/024_paste.sql"),
      "utf8"
    );

    // Exercise both tracked forms. The paste copy is applied second, so all
    // behavioral assertions below run against the exact SQL Tasos will use.
    await db.exec(migration);
    await db.exec(pasteMigration);

    const call = async (
      quote: Record<string, unknown>,
      reservationPayload: Record<string, unknown>,
      promo: string | null,
      key: string
    ): Promise<BookingResult> => {
      const result = await db.query<{ booking: BookingResult }>(
        "select public.create_web_booking($1::jsonb, $2::jsonb, $3::text, $4::text, 0.30) as booking",
        [JSON.stringify(quote), JSON.stringify(reservationPayload), promo, key]
      );
      return result.rows[0].booking;
    };

    const first = await call({ ref: "FIRST1", total: 100 }, reservation, "SAVE10", "same-request");
    expect(first).toMatchObject({
      ref: "FIRST1",
      discount: 10,
      total: 90,
      deposit: 27,
      balance_due: 63,
      idempotent_replay: false,
    });

    const stored = await db.query<{
      quote_id_defaulted: boolean;
      quote_time_defaulted: boolean;
      reservation_id_defaulted: boolean;
      reservation_time_defaulted: boolean;
      quote_total: string;
      reservation_total: string;
      discount_reason: string;
      used_count: number;
    }>(`
      select q.id is not null as quote_id_defaulted,
             q.created_at is not null as quote_time_defaulted,
             r.id is not null as reservation_id_defaulted,
             r.created_at is not null as reservation_time_defaulted,
             q.total::text as quote_total,
             r.total::text as reservation_total,
             r.discount_reason,
             p.used_count
        from public.quotes q
        cross join public.reservations r
        join public.promo_codes p on p.code = 'SAVE10'
       where q.ref = 'FIRST1'
    `);
    expect(stored.rows[0]).toEqual({
      quote_id_defaulted: true,
      quote_time_defaulted: true,
      reservation_id_defaulted: true,
      reservation_time_defaulted: true,
      quote_total: "90.00",
      reservation_total: "90.00",
      discount_reason: "Promo: SAVE10",
      used_count: 1,
    });

    const replay = await call({ ref: "OTHER1", total: 999 }, reservation, "SAVE10", "same-request");
    expect(replay).toMatchObject({ ref: "FIRST1", idempotent_replay: true, total: 90 });
    expect((await db.query<{ count: number }>("select count(*)::int as count from public.quotes")).rows[0].count).toBe(1);
    expect((await db.query<{ used_count: number }>("select used_count from public.promo_codes where code = 'SAVE10'")).rows[0].used_count).toBe(1);

    // A SELECT INTO miss must not null the initialized zero discount. This
    // caught a version that would have stored every no-promo booking at €0.
    const fullPrice = await call({ ref: "FULL01", total: 100 }, reservation, "EXHAUSTED", "full-price");
    expect(fullPrice).toMatchObject({ discount: 0, total: 100, deposit: 30, balance_due: 70, promo_id: null });

    const noPromo = await call({ ref: "NOPR01", total: 100 }, reservation, null, "no-promo");
    expect(noPromo).toMatchObject({ discount: 0, total: 100, deposit: 30, balance_due: 70, promo_id: null });

    const capped = await call({ ref: "CAP001", total: 100 }, reservation, "TOOBIG", "capped-promo");
    expect(capped).toMatchObject({ discount: 100, total: 0, deposit: 0, balance_due: 0 });

    await expect(call(
      { ref: "FAIL01", total: 100 },
      { ...reservation, customer_name: undefined },
      "ONCE",
      "failed-request"
    )).rejects.toThrow();
    expect((await db.query<{ count: number }>("select count(*)::int as count from public.quotes where ref = 'FAIL01'")).rows[0].count).toBe(0);
    expect((await db.query<{ used_count: number }>("select used_count from public.promo_codes where code = 'ONCE'")).rows[0].used_count).toBe(0);

    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select has_function_privilege('anon', 'public.create_web_booking(jsonb,jsonb,text,text,numeric)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.create_web_booking(jsonb,jsonb,text,text,numeric)', 'execute') as authenticated,
             has_function_privilege('service_role', 'public.create_web_booking(jsonb,jsonb,text,text,numeric)', 'execute') as service_role
    `);
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });

    const config = await db.query<{ proconfig: string[] }>(`
      select p.proconfig
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_web_booking'
    `);
    expect(config.rows[0].proconfig).toEqual(["search_path=\"\""]);
  } finally {
    await db.close();
  }
}, 20_000);
