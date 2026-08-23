import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

// Each case starts its own in-process Postgres and replays the migration. That
// is a few seconds' work on its own and considerably more when the rest of the
// suite is competing for the machine, so the default 5s limit fails these on
// load rather than on behaviour.
vi.setConfig({ testTimeout: 60_000 });

const migrationPath = "supabase/migrations/20260823170000_promo_ledger_seats_email_kinds.sql";
const pastePath = "supabase/migrations/paste/033_promo_ledger_seats_email_kinds_paste.sql";

/**
 * Enough of the live schema for the migration to attach to. The real tables
 * carry many more columns; only the ones this migration reads, constrains or
 * inserts into matter here.
 */
const BASE_SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.promo_codes (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,
    description text,
    type text not null default 'percentage' check (type in ('percentage','fixed')),
    value numeric not null,
    max_uses integer,
    used_count integer default 0,
    expires_at date,
    active boolean default true,
    created_at timestamptz default now()
  );

  create table public.customers (
    id uuid primary key default gen_random_uuid(),
    email text
  );

  create table public.quotes (
    id uuid primary key default gen_random_uuid(),
    ref text,
    baby_seat int default 0,
    child_seat int default 0,
    total numeric,
    deposit numeric,
    balance_due numeric,
    discount_amount numeric default 0,
    idempotency_key text,
    created_at timestamptz default now()
  );

  create table public.reservations (
    id uuid primary key default gen_random_uuid(),
    quote_id uuid references public.quotes(id) on delete set null,
    baby_seat int default 0,
    child_seat int default 0,
    promo_code_id uuid references public.promo_codes(id),
    discount_amount numeric default 0,
    created_at timestamptz default now()
  );

  create table public.booking_email_deliveries (
    id uuid primary key default gen_random_uuid(),
    reservation_id uuid not null references public.reservations(id) on delete cascade,
    kind text not null check (kind in ('quote_confirmation')),
    intended_recipient_email text not null,
    delivery_recipient_email text not null,
    subject text not null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  );
`;

async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE_SCHEMA);
  const migration = await readFile(join(process.cwd(), migrationPath), "utf8");
  await db.exec(migration);
  return db;
}

async function newReservation(db: PGlite, promoId: string | null = null): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into public.reservations (promo_code_id) values ($1) returning id",
    [promoId],
  );
  return res.rows[0].id;
}

async function limitedPromo(db: PGlite, maxUses: number | null, code = "SUMMER10"): Promise<string> {
  const res = await db.query<{ id: string }>(`
    insert into public.promo_codes (code, type, value, max_uses)
    values ($1, 'percentage', 10, $2) returning id
  `, [code, maxUses]);
  return res.rows[0].id;
}

const call = async <T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query<{ result: T }>(sql, params)).rows[0].result;

describe("promo ledger, child-seat limit and email kinds migration", () => {
  it("applies, and the SQL Editor paste copy is safe to run over it", async () => {
    const db = await migratedDatabase();
    try {
      const paste = await readFile(join(process.cwd(), pastePath), "utf8");
      // The exact copy Tasos pastes must reach the same final state.
      await db.exec(paste);
      const fn = await db.query(`
        select proname from pg_proc where proname in
          ('promo_hold','promo_redeem','promo_release','promo_uses_remaining','promo_release_expired')
        order by proname
      `);
      expect(fn.rows.map((r) => (r as { proname: string }).proname)).toEqual([
        "promo_hold", "promo_redeem", "promo_release", "promo_release_expired", "promo_uses_remaining",
      ]);
    } finally {
      await db.close();
    }
  });

  it("does not consume a use until a hold is taken, and releases it again", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 1);
      const reservation = await newReservation(db, promo);

      // A website request only validates. Nothing is held yet.
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(1);

      const held = await call<{ ok: boolean; state: string }>(db, `
        select public.promo_hold($1, $2, now() + interval '1 day', 12.34, null) as result
      `, [promo, reservation]);
      expect(held).toMatchObject({ ok: true, state: "held" });
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(0);

      // Cancelled before payment: the use comes back.
      expect(await call<{ ok: boolean; released: number }>(db,
        "select public.promo_release($1, 'reservation cancelled') as result", [reservation]))
        .toMatchObject({ ok: true, released: 1 });
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("treats a lapsed hold as available again", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 1);
      const reservation = await newReservation(db, promo);

      await db.query(`
        insert into public.promo_redemptions (promo_code_id, reservation_id, state, expires_at)
        values ($1, $2, 'held', now() - interval '1 hour')
      `, [promo, reservation]);

      // Expired holds must not keep a code exhausted.
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(1);
      expect(await call<number>(db,
        "select public.promo_release_expired() as result")).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("refuses a second hold when the last use is already claimed", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 1);
      const first = await newReservation(db, promo);
      const second = await newReservation(db, promo);

      expect(await call<{ ok: boolean }>(db,
        "select public.promo_hold($1, $2, now() + interval '1 day', null, null) as result",
        [promo, first])).toMatchObject({ ok: true });

      expect(await call<{ ok: boolean; reason: string }>(db,
        "select public.promo_hold($1, $2, now() + interval '1 day', null, null) as result",
        [promo, second])).toMatchObject({ ok: false, reason: "exhausted" });
    } finally {
      await db.close();
    }
  });

  it("extends rather than duplicates a hold when a quote confirmation is resent", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 2);
      const reservation = await newReservation(db, promo);

      await call(db, "select public.promo_hold($1, $2, now() + interval '1 day', null, null) as result",
        [promo, reservation]);
      expect(await call<{ extended: boolean }>(db,
        "select public.promo_hold($1, $2, now() + interval '3 days', null, null) as result",
        [promo, reservation])).toMatchObject({ ok: true, extended: true });

      const rows = await db.query("select count(*)::int as n from public.promo_redemptions");
      expect((rows.rows[0] as { n: number }).n).toBe(1);
      // One use consumed by one reservation, however many times it was sent.
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("redeems once however many times payment is replayed", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 5);
      const reservation = await newReservation(db, promo);
      await call(db, "select public.promo_hold($1, $2, now() + interval '1 day', null, null) as result",
        [promo, reservation]);

      expect(await call<{ already: boolean }>(db,
        "select public.promo_redeem($1, 12.00) as result", [reservation]))
        .toMatchObject({ ok: true, state: "redeemed", already: false });
      expect(await call<{ already: boolean }>(db,
        "select public.promo_redeem($1, 12.00) as result", [reservation]))
        .toMatchObject({ ok: true, state: "redeemed", already: true });

      const used = await db.query("select used_count from public.promo_codes where id=$1", [promo]);
      expect((used.rows[0] as { used_count: number }).used_count).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("never releases a use that was actually paid for", async () => {
    const db = await migratedDatabase();
    try {
      const promo = await limitedPromo(db, 1);
      const reservation = await newReservation(db, promo);
      await call(db, "select public.promo_hold($1, $2, now() + interval '1 day', null, null) as result",
        [promo, reservation]);
      await call(db, "select public.promo_redeem($1, null) as result", [reservation]);

      expect(await call<{ released: number }>(db,
        "select public.promo_release($1, 'late cancellation') as result", [reservation]))
        .toMatchObject({ released: 0 });
      expect(await call<number>(db,
        "select public.promo_uses_remaining($1) as result", [promo])).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("rejects seat combinations that do not fit, and accepts those that do", async () => {
    const db = await migratedDatabase();
    try {
      for (const [baby, child] of [[0, 3], [1, 2], [2, 1], [3, 0]]) {
        await expect(db.query(
          "insert into public.reservations (baby_seat, child_seat) values ($1,$2)", [baby, child],
        )).resolves.toBeDefined();
        await expect(db.query(
          "insert into public.quotes (baby_seat, child_seat) values ($1,$2)", [baby, child],
        )).resolves.toBeDefined();
      }

      // Includes 3+3, the pair that reached production as quote 2R55WT.
      for (const [baby, child] of [
        [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
        [4, 0], [0, 4], [-1, 0], [0, -2],
      ]) {
        await expect(db.query(
          "insert into public.reservations (baby_seat, child_seat) values ($1,$2)", [baby, child],
        )).rejects.toThrow();
        await expect(db.query(
          "insert into public.quotes (baby_seat, child_seat) values ($1,$2)", [baby, child],
        )).rejects.toThrow();
      }
    } finally {
      await db.close();
    }
  });

  it("blocks an update that would breach the limit, not only an insert", async () => {
    const db = await migratedDatabase();
    try {
      // The constraint has to hold when staff edit an existing booking, which
      // is the path a raw UPDATE takes. A CHECK that only bit on INSERT would
      // leave every edit screen able to write 3+3.
      const res = await db.query<{ id: string }>(
        "insert into public.reservations (baby_seat, child_seat) values (1, 1) returning id",
      );
      const id = res.rows[0].id;

      await expect(db.query(
        "update public.reservations set child_seat = 3 where id = $1", [id],
      )).rejects.toThrow();

      await expect(db.query(
        "update public.reservations set baby_seat = 3, child_seat = 3 where id = $1", [id],
      )).rejects.toThrow();

      // ...while a legitimate edit still goes through.
      await expect(db.query(
        "update public.reservations set baby_seat = 2, child_seat = 1 where id = $1", [id],
      )).resolves.toBeDefined();

      const after = await db.query("select baby_seat, child_seat from public.reservations where id=$1", [id]);
      expect(after.rows[0]).toMatchObject({ baby_seat: 2, child_seat: 1 });

      const quote = await db.query<{ id: string }>(
        "insert into public.quotes (baby_seat, child_seat) values (0, 2) returning id",
      );
      await expect(db.query(
        "update public.quotes set baby_seat = 2 where id = $1", [quote.rows[0].id],
      )).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  it("refuses to apply the seat limit over rows that already breach it", async () => {
    const db = new PGlite();
    try {
      await db.exec(BASE_SCHEMA);
      await db.query("insert into public.reservations (baby_seat, child_seat) values (3, 3)");
      const migration = await readFile(join(process.cwd(), migrationPath), "utf8");
      // Refusing loudly is the point: a half-applied constraint would be worse
      // than not applying it, and silently trimming a customer's request worse
      // still.
      await expect(db.exec(migration)).rejects.toThrow(/already exceed it/);
    } finally {
      await db.close();
    }
  });

  it("accepts all three workflow email kinds and allows each once per reservation", async () => {
    const db = await migratedDatabase();
    try {
      const reservation = await newReservation(db);
      const insert = (kind: string, status = "accepted") => db.query(`
        insert into public.booking_email_deliveries (
          reservation_id, kind, intended_recipient_email,
          delivery_recipient_email, subject, status
        ) values ($1, $2, 'alex@example.com', 'alex@example.com', 'Subject', $3)
      `, [reservation, kind, status]);

      await expect(insert("acknowledgment")).resolves.toBeDefined();
      await expect(insert("quote_confirmation")).resolves.toBeDefined();
      await expect(insert("booking_confirmation")).resolves.toBeDefined();

      // Once each for the two that are sent exactly once...
      await expect(insert("acknowledgment")).rejects.toThrow();
      await expect(insert("booking_confirmation")).rejects.toThrow();
      // ...but a quote confirmation may deliberately be resent.
      await expect(insert("quote_confirmation")).resolves.toBeDefined();

      // A confirmation that could be neither sent nor queued is marked failed,
      // which drops it out of the index so the retry can send. The failed row
      // stays as the record that a confirmation once went missing.
      await db.query("update public.booking_email_deliveries set status='failed' where kind='booking_confirmation'");
      await expect(insert("booking_confirmation")).resolves.toBeDefined();

      // And the retry is itself protected once it has been accepted.
      await expect(insert("booking_confirmation")).rejects.toThrow();

      const rows = await db.query(
        "select count(*)::int as n from public.booking_email_deliveries where kind='booking_confirmation'",
      );
      expect((rows.rows[0] as { n: number }).n).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("keeps the ledger and its functions away from public roles", async () => {
    const db = await migratedDatabase();
    try {
      const grants = await db.query(`
        select grantee, privilege_type from information_schema.role_table_grants
         where table_name = 'promo_redemptions' and grantee in ('anon','authenticated','PUBLIC')
      `);
      expect(grants.rows).toEqual([]);

      const canExecute = await db.query(`
        select has_function_privilege('anon', 'public.promo_hold(uuid,uuid,timestamptz,numeric,uuid)', 'EXECUTE') as anon,
               has_function_privilege('authenticated', 'public.promo_redeem(uuid,numeric)', 'EXECUTE') as auth
      `);
      expect(canExecute.rows[0]).toMatchObject({ anon: false, auth: false });

      const rls = await db.query(`
        select relrowsecurity from pg_class where relname = 'promo_redemptions'
      `);
      expect((rls.rows[0] as { relrowsecurity: boolean }).relrowsecurity).toBe(true);
    } finally {
      await db.close();
    }
  });
});
