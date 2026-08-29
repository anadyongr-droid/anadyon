import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const migrationPath = "supabase/migrations/20260828140000_drop_legacy_licence_number.sql";
const pastePath = "supabase/migrations/paste/036_drop_legacy_licence_number_paste.sql";

/** Production carries both columns; the repository baseline only the canonical one. */
const WITH_LEGACY = `
  create table public.customers (
    id uuid primary key default gen_random_uuid(),
    email text,
    licence_number text,
    driving_licence_number text,
    driving_licence_expiry date
  );
`;
const WITHOUT_LEGACY = `
  create table public.customers (
    id uuid primary key default gen_random_uuid(),
    email text,
    driving_licence_number text,
    driving_licence_expiry date
  );
`;

const migration = async () => readFile(join(process.cwd(), migrationPath), "utf8");

/**
 * The migration's own DO block, extracted rather than copied.
 *
 * A RAISE aborts the surrounding transaction, so every statement after it in
 * the file fails with "current transaction is aborted" and PGlite surfaces
 * THAT as the error — hiding the message the migration exists to produce. The
 * block alone raises cleanly, and it is the whole substance of the file.
 */
async function refusalBlock(): Promise<string> {
  const sql = await migration();
  const block = sql.match(/do \$\$[\s\S]*?\n\$\$;/)?.[0];
  if (!block) throw new Error("DO block not found in the migration");
  return block;
}

async function db(schema: string): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(schema);
  return pg;
}
const columnExists = async (pg: PGlite) => (await pg.query(
  `select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='licence_number'`)).rows.length > 0;

describe("dropping the legacy licence column", () => {
  it("carries a value held only in the legacy column across, then drops it", async () => {
    const pg = await db(WITH_LEGACY);
    try {
      await pg.query(`insert into public.customers (email, licence_number) values ('a@x.gr', ' GR-111 ')`);
      await pg.exec(await migration());

      const { rows } = await pg.query<{ driving_licence_number: string }>(
        `select driving_licence_number from public.customers where email = 'a@x.gr'`);
      // Trimmed on the way across: the legacy column was free text and several
      // rows carry padding that would fail an exact comparison later.
      expect(rows[0].driving_licence_number).toBe("GR-111");
      expect(await columnExists(pg)).toBe(false);
    } finally { await pg.close(); }
  });

  it("leaves a canonical value alone when both agree", async () => {
    const pg = await db(WITH_LEGACY);
    try {
      await pg.query(`insert into public.customers (email, licence_number, driving_licence_number)
                      values ('b@x.gr', 'GR-222', 'GR-222')`);
      await pg.exec(await migration());
      const { rows } = await pg.query<{ driving_licence_number: string }>(
        `select driving_licence_number from public.customers where email = 'b@x.gr'`);
      expect(rows[0].driving_licence_number).toBe("GR-222");
    } finally { await pg.close(); }
  });

  it("REFUSES when a row holds a different value in each column", async () => {
    // The point of the migration. There is no way to tell from here which is
    // current, and picking one silently is how the wrong licence number ends up
    // printed on a rental agreement.
    const pg = await db(WITH_LEGACY);
    try {
      await pg.query(`insert into public.customers (email, licence_number, driving_licence_number)
                      values ('c@x.gr', 'GR-OLD', 'GR-NEW')`);
      await expect(pg.exec(await refusalBlock())).rejects.toThrow(/refusing to drop licence_number: 1 customer row/);
      expect(await columnExists(pg), "the column must survive a refusal").toBe(true);
    } finally { await pg.close(); }
  });

  it("names how many rows need resolving, not just that some do", async () => {
    const pg = await db(WITH_LEGACY);
    try {
      for (const e of ["d@x.gr", "e@x.gr", "f@x.gr"]) {
        await pg.query(`insert into public.customers (email, licence_number, driving_licence_number)
                        values ($1, 'OLD', 'NEW')`, [e]);
      }
      await expect(pg.exec(await refusalBlock())).rejects.toThrow(/3 customer row\(s\)/);
    } finally { await pg.close(); }
  });

  it("treats blank and whitespace-only legacy values as nothing to carry", async () => {
    const pg = await db(WITH_LEGACY);
    try {
      await pg.query(`insert into public.customers (email, licence_number) values ('g@x.gr', '   ')`);
      await pg.exec(await migration());
      const { rows } = await pg.query<{ driving_licence_number: string | null }>(
        `select driving_licence_number from public.customers where email = 'g@x.gr'`);
      expect(rows[0].driving_licence_number).toBeNull();
    } finally { await pg.close(); }
  });

  it("is a no-op where the column has already gone", async () => {
    // Tasos runs these by hand, sometimes twice, and the repository baseline
    // never had the column at all — so a fresh database must not fail here.
    const pg = await db(WITHOUT_LEGACY);
    try {
      await pg.exec(await migration());
      await pg.exec(await migration());
      expect(await columnExists(pg)).toBe(false);
    } finally { await pg.close(); }
  });

  it("applies, and the SQL Editor paste copy is safe to run over it", async () => {
    const pg = await db(WITH_LEGACY);
    try {
      await pg.exec(await migration());
      await pg.exec(await readFile(join(process.cwd(), pastePath), "utf8"));
    } finally { await pg.close(); }
  });
});
