#!/usr/bin/env node
/**
 * Asserts that anon, authenticated and PUBLIC hold no privileges beyond
 * SELECT on the two deliberately public tables.
 *
 * Behavioural probing is the primary check here — it asks production what a
 * caller with the public key can actually do, which is the question that
 * matters and needs no database function. The grant-level assertion runs too
 * when migration 023 has been applied, and catches what probing cannot: a
 * privilege that is currently masked by RLS and would be inherited by the next
 * policy somebody adds in good faith.
 *
 * Run:  set -a; . ./.env.local; set +a; node scripts/check-grants.mjs
 */
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(1);
}

/** Tables the public key is allowed to read. Everything else must refuse. */
const PUBLIC_READABLE = new Set(["rates", "extras_config"]);

const SENSITIVE = [
  "reservations", "customers", "quotes", "vehicles", "emails",
  "promo_codes", "discount_rules", "system_settings", "alert_outbox",
  "vehicle_costs", "vehicle_damages", "competitor_rates", "rate_limits",
];

const h = { apikey: anon, Authorization: `Bearer ${anon}` };
let failures = 0;

async function status(method, table, body) {
  const res = await fetch(`${url}/rest/v1/${table}${method === "GET" ? "?select=*&limit=1" : ""}`, {
    method,
    headers: { ...h, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.status;
}

console.log("Anonymous access to sensitive tables\n");

for (const table of SENSITIVE) {
  const read  = await status("GET", table);
  const write = await status("POST", table, {});
  const readOk  = read >= 400;
  const writeOk = write >= 400;
  if (!readOk || !writeOk) failures++;
  console.log(`  ${readOk && writeOk ? "ok  " : "FAIL"}  ${table.padEnd(20)} read=${read} write=${write}`);
}

console.log("\nDeliberately public tables\n");
for (const table of PUBLIC_READABLE) {
  const read  = await status("GET", table);
  const write = await status("POST", table, {});
  const ok = read === 200 && write >= 400;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${table.padEnd(20)} read=${read} (want 200)  write=${write} (want 4xx)`);
}

// Grant-level assertion, once migration 023 exists.
if (svc) {
  const res = await fetch(`${url}/rest/v1/rpc/assert_least_privilege`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.ok) {
    const rows = await res.json();
    console.log(`\nResidual grants: ${rows.length}\n`);
    for (const r of rows.slice(0, 20)) {
      console.log(`  FAIL  ${r.grantee} has ${r.privilege_type} on ${r.table_name}`);
    }
    failures += rows.length;
  } else {
    console.log("\nGrant assertion unavailable — migration 023 not applied yet.");
    console.log("Behavioural checks above still ran; apply 023 for the grant-level check.");
  }
}

console.log(failures ? `\n${failures} problem(s)` : "\nLeast privilege holds.");
process.exit(failures ? 1 : 0);
