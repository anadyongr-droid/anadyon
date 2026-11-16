import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { SUPABASE_COMPATIBILITY_STUBS } from "../scripts/pgliteSupabaseStubs.mjs";
const db = new PGlite();
const user = "aaaaaaaa-0000-4000-8000-000000000001";
const handover = "bbbbbbbb-0000-4000-8000-000000000001";
const calls = [
  `select public.finalise_check_out('${handover}')`,
  `select public.finalise_check_in('${handover}')`,
  `select public.correct_handover('${handover}','test','{\"fuel_eighths\":7}'::jsonb)`,
  `select public.void_handover('${handover}','test')`,
];
beforeAll(async () => {
  await db.exec(SUPABASE_COMPATIBILITY_STUBS);
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users(id,raw_app_meta_data) values ($1,'{\"role\":\"admin\"}')", [user]);
});
afterAll(() => db.close());
it.each(calls)("requires verified assurance for direct authenticated RPC: %s", async (sql) => {
  for (const aal of ["aal1", undefined, null, "aal3"]) {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, aal })]);
    await db.exec("set role authenticated");
    try { await expect(db.query(sql)).rejects.toMatchObject({ code: "AN403", message: "verified MFA is required" }); }
    finally { await db.exec("reset role"); }
  }
});
it.each(calls)("verified aal2 reaches the implementation, proving a real privileged fixture: %s", async (sql) => {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, aal: "aal2" })]);
  await db.exec("set role authenticated");
  try { await expect(db.query(sql)).rejects.toMatchObject({ code: "AN404" }); }
  finally { await db.exec("reset role"); }
});
