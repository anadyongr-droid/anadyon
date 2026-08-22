import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function migratedDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create table public.customers (
      id uuid primary key default gen_random_uuid(),
      title text, first_name text, last_name text, full_name text, name text,
      email text, phone text, dob date, nationality text, address text,
      postal_code text, city text, country text,
      last_interaction_at timestamptz, updated_at timestamptz default now()
    );
    create table public.quotes (
      id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id),
      title text, first_name text, last_name text, email text, mobile_tel text,
      dob text, address text, postal_code text, city text, country text, flight_number text
    );
    create table public.reservations (
      id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id),
      quote_id uuid references public.quotes(id), customer_first_name text,
      customer_last_name text, customer_name text, customer_email text,
      customer_phone text, customer_dob date, customer_nationality text, status text default 'pending',
      flight_number text, updated_at timestamptz default now()
    );
  `);
  const migration = await readFile(
    join(process.cwd(), "supabase/migrations/20260822150000_sync_customer_booking_fields.sql"),
    "utf8",
  );
  const paste = await readFile(
    join(process.cwd(), "supabase/migrations/paste/029_sync_customer_booking_fields_paste.sql"),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(paste);
  return db;
}

describe("shared customer field synchronization", () => {
  it("backfills pre-existing identity drift from the customer master", async () => {
    const db = await migratedDatabase();
    try {
      const customer = await db.query<{ id: string }>(`
        insert into public.customers(first_name, last_name, full_name, email, phone, dob)
        values ('Canonical', 'Customer', 'Canonical Customer', 'right@example.test', '222', '1991-04-05') returning id
      `);
      const customerId = customer.rows[0].id;
      const quote = await db.query<{ id: string }>(`insert into public.quotes(customer_id, first_name, last_name, email, mobile_tel, dob)
        values ($1, 'Old', 'Snapshot', 'wrong@example.test', '111', null) returning id`, [customerId]);
      await db.query(`insert into public.reservations(customer_id, quote_id, customer_first_name, customer_last_name,
        customer_name, customer_email, customer_phone, customer_dob)
        values ($1, $2, 'Old', 'Snapshot', 'Old Snapshot', 'wrong@example.test', '111', null)`, [customerId, quote.rows[0].id]);

      const migration = await readFile(
        join(process.cwd(), "supabase/migrations/20260822153000_backfill_shared_customer_fields.sql"),
        "utf8",
      );
      const paste = await readFile(
        join(process.cwd(), "supabase/migrations/paste/030_backfill_shared_customer_fields_paste.sql"),
        "utf8",
      );
      await db.exec(migration);
      await db.exec(paste);

      const storedQuote = await db.query(`select first_name, last_name, email, mobile_tel, dob
        from public.quotes where customer_id=$1`, [customerId]);
      expect(storedQuote.rows[0]).toEqual({ first_name: "Canonical", last_name: "Customer",
        email: "right@example.test", mobile_tel: "222", dob: "1991-04-05" });
      const reservation = await db.query(`select customer_first_name, customer_last_name,
        customer_name, customer_email, customer_phone, customer_dob::text
        from public.reservations where customer_id=$1`, [customerId]);
      expect(reservation.rows[0]).toEqual({ customer_first_name: "Canonical", customer_last_name: "Customer",
        customer_name: "Canonical Customer", customer_email: "right@example.test",
        customer_phone: "222", customer_dob: "1991-04-05" });
    } finally {
      await db.close();
    }
  });

  it("fans a customer correction out to linked quotes and reservations", async () => {
    const db = await migratedDatabase();
    try {
      const inserted = await db.query<{ id: string }>(`
        insert into public.customers(first_name, last_name, full_name, email, phone)
        values ('Old', 'Name', 'Old Name', 'old@example.test', '111') returning id
      `);
      const customerId = inserted.rows[0].id;
      await db.query(`insert into public.quotes(customer_id, first_name, last_name, email, mobile_tel)
        values ($1, 'Old', 'Name', 'old@example.test', '111')`, [customerId]);
      await db.query(`insert into public.reservations(customer_id, customer_first_name, customer_last_name,
        customer_name, customer_email, customer_phone)
        values ($1, 'Old', 'Name', 'Old Name', 'old@example.test', '111')`, [customerId]);

      await db.query(`
        update public.customers
           set first_name='Correct', last_name='Person', full_name='Correct Person',
               email='correct@example.test', phone='222', dob='1990-03-04', nationality='Italian'
         where id=$1
      `, [customerId]);

      const reservation = await db.query(`select customer_first_name, customer_last_name, customer_name,
        customer_email, customer_phone, customer_dob::text, customer_nationality
        from public.reservations where customer_id=$1`, [customerId]);
      expect(reservation.rows[0]).toEqual({
        customer_first_name: "Correct", customer_last_name: "Person", customer_name: "Correct Person",
        customer_email: "correct@example.test", customer_phone: "222", customer_dob: "1990-03-04",
        customer_nationality: "Italian",
      });
      const quote = await db.query(`select first_name, last_name, email, mobile_tel, dob
        from public.quotes where customer_id=$1`, [customerId]);
      expect(quote.rows[0]).toEqual({
        first_name: "Correct", last_name: "Person", email: "correct@example.test",
        mobile_tel: "222", dob: "1990-03-04",
      });
    } finally {
      await db.close();
    }
  });

  it("syncs a reservation correction but keeps a flight on its own booking", async () => {
    const db = await migratedDatabase();
    try {
      const customer = await db.query<{ id: string }>(`
        insert into public.customers(first_name, last_name, full_name, email, phone)
        values ('Old', 'Name', 'Old Name', 'old@example.test', '111') returning id
      `);
      const customerId = customer.rows[0].id;
      const quotes = await db.query<{ id: string }>(`
        insert into public.quotes(customer_id, first_name, last_name, email, mobile_tel, flight_number)
        values ($1, 'Old', 'Name', 'old@example.test', '111', 'OLD1'),
               ($1, 'Old', 'Name', 'old@example.test', '111', 'OTHER2') returning id
      `, [customerId]);
      const reservations = await db.query<{ id: string }>(`
        insert into public.reservations(customer_id, quote_id, customer_first_name, customer_last_name,
          customer_name, customer_email, customer_phone, flight_number)
        values ($1, $2, 'Old', 'Name', 'Old Name', 'old@example.test', '111', 'OLD1'),
               ($1, $3, 'Old', 'Name', 'Old Name', 'old@example.test', '111', 'OTHER2') returning id
      `, [customerId, quotes.rows[0].id, quotes.rows[1].id]);

      await db.query(`update public.reservations
        set customer_first_name='New', customer_last_name='Surname', customer_email='new@example.test',
            customer_phone='333', customer_dob='1988-07-09', flight_number='A3 320'
        where id=$1`, [reservations.rows[0].id]);

      const master = await db.query(`select first_name, last_name, full_name, email, phone, dob::text
        from public.customers where id=$1`, [customerId]);
      expect(master.rows[0]).toEqual({ first_name: "New", last_name: "Surname", full_name: "New Surname",
        email: "new@example.test", phone: "333", dob: "1988-07-09" });
      const flights = await db.query<{ flight_number: string }>(`select flight_number from public.quotes order by id`);
      expect(flights.rows.map((row) => row.flight_number).sort()).toEqual(["A3 320", "OTHER2"]);
      const linked = await db.query(`select customer_first_name, customer_email from public.reservations where id=$1`, [reservations.rows[1].id]);
      expect(linked.rows[0]).toEqual({ customer_first_name: "New", customer_email: "new@example.test" });
    } finally {
      await db.close();
    }
  });
});
