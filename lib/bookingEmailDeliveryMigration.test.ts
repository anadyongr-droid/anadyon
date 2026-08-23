import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260823130603_booking_email_delivery_audit.sql";
const pastePath = "supabase/migrations/paste/032_booking_email_delivery_audit_paste.sql";

describe("booking email delivery audit migration", () => {
  it("tracks ordered events, ignores replay and preserves least privilege", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin;
        create table public.reservations (
          id uuid primary key default gen_random_uuid()
        );
      `);

      const migration = await readFile(join(process.cwd(), migrationPath), "utf8");
      const paste = await readFile(join(process.cwd(), pastePath), "utf8");
      await db.exec(migration);
      // The exact SQL Editor copy must be safe to run and define the same final
      // function, permissions and tables as the tracked migration.
      await db.exec(paste);

      const reservation = await db.query<{ id: string }>(
        "insert into public.reservations default values returning id",
      );
      const delivery = await db.query<{ id: string }>(`
        insert into public.booking_email_deliveries (
          reservation_id, kind, intended_recipient_email,
          delivery_recipient_email, subject, payment_deadline
        ) values ($1, 'quote_confirmation', 'alex@example.com',
          'alex@example.com', 'Quote confirmation', '2027-08-24T17:00:00Z')
        returning id
      `, [reservation.rows[0].id]);
      const deliveryId = delivery.rows[0].id;

      const record = async (
        svixId: string,
        type: string,
        at: string,
        recipient = "alex@example.com",
      ) => (await db.query<{ result: Record<string, unknown> }>(`
        select public.record_booking_email_event(
          $1::uuid, $2, 'resend-email-1', $3, $4::timestamptz, $5, null
        ) as result
      `, [deliveryId, svixId, type, at, recipient])).rows[0].result;

      expect(await record("event-delivered", "email.delivered", "2027-08-23T10:02:00Z"))
        .toMatchObject({ matched: true, changed: true, duplicate: false, status: "delivered" });

      const stored = await db.query(`
        select status, provider_message_id, delivered_at::text, last_webhook_id
          from public.booking_email_deliveries where id=$1
      `, [deliveryId]);
      expect(stored.rows[0]).toMatchObject({
        status: "delivered",
        provider_message_id: "resend-email-1",
        last_webhook_id: "event-delivered",
      });

      expect(await record("event-delivered", "email.delivered", "2027-08-23T10:02:00Z"))
        .toMatchObject({ matched: true, changed: false, duplicate: true });

      // Resend documents that webhooks can arrive out of order. An older sent
      // event is retained as evidence but cannot regress a delivered status.
      expect(await record("event-sent", "email.sent", "2027-08-23T10:01:00Z"))
        .toMatchObject({ matched: true, changed: false, duplicate: false, status: "delivered" });
      expect((await db.query<{ status: string }>(
        "select status from public.booking_email_deliveries where id=$1", [deliveryId],
      )).rows[0].status).toBe("delivered");

      // The BCC copy carries the same tag and provider ID. Recipient matching
      // prevents its event from being mistaken for customer delivery.
      expect(await record("event-office", "email.delivered", "2027-08-23T10:03:00Z", "customerservice@anadyon.gr"))
        .toMatchObject({ matched: false, changed: false });

      const eventCount = await db.query<{ count: number }>(
        "select count(*)::int as count from public.booking_email_events where delivery_id=$1", [deliveryId],
      );
      expect(eventCount.rows[0].count).toBe(2);

      const privileges = await db.query<{
        anon_table: boolean;
        authenticated_table: boolean;
        service_table: boolean;
        anon_function: boolean;
        authenticated_function: boolean;
        service_function: boolean;
      }>(`
        select
          has_table_privilege('anon', 'public.booking_email_deliveries', 'select') as anon_table,
          has_table_privilege('authenticated', 'public.booking_email_deliveries', 'select') as authenticated_table,
          has_table_privilege('service_role', 'public.booking_email_deliveries', 'select') as service_table,
          has_function_privilege('anon', 'public.record_booking_email_event(uuid,text,text,text,timestamptz,text,text)', 'execute') as anon_function,
          has_function_privilege('authenticated', 'public.record_booking_email_event(uuid,text,text,text,timestamptz,text,text)', 'execute') as authenticated_function,
          has_function_privilege('service_role', 'public.record_booking_email_event(uuid,text,text,text,timestamptz,text,text)', 'execute') as service_function
      `);
      expect(privileges.rows[0]).toEqual({
        anon_table: false,
        authenticated_table: false,
        service_table: true,
        anon_function: false,
        authenticated_function: false,
        service_function: true,
      });

      const rls = await db.query<{ table_name: string; enabled: boolean }>(`
        select relname as table_name, relrowsecurity as enabled
          from pg_class
         where relname in ('booking_email_deliveries', 'booking_email_events')
         order by relname
      `);
      expect(rls.rows).toEqual([
        { table_name: "booking_email_deliveries", enabled: true },
        { table_name: "booking_email_events", enabled: true },
      ]);
    } finally {
      await db.close();
    }
  }, 20_000);
});
