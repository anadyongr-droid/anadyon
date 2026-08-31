#!/usr/bin/env node
/**
 * Diagnostic 10c — does auth.uid() resolve inside a SECURITY DEFINER function
 * when the call carries a *user's* JWT rather than the service role?
 *
 * docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md §12.4 concluded that Option A needs
 * no RLS policy work, because the privileged work still happens inside
 * SECURITY DEFINER functions that bypass RLS — what changes hands is identity,
 * not privilege. That conclusion rests on this one behaviour, and §3 of the
 * same document records a confident belief about auth.uid() that turned out to
 * be wrong. So it is tested.
 *
 * ─── Why a script and not the browser ───
 *
 * The first version of this asked for a route to be opened while signed in to
 * /admin. That was more ceremony than the question needs. Signing in with a
 * password yields a JWT carrying `sub` at aal1 — MFA raises the level, it does
 * not add the subject — and a JWT reaching PostgREST is the whole mechanism
 * under test. No browser, no cookies, no authenticator app.
 *
 * ─── The control is the point ───
 *
 * It calls the function twice: once with the user's token and once with the
 * service role. The service-role call is expected to return a NULL uid — that
 * is the defect the whole document is about. A run where *both* are null means
 * something else is wrong and neither result should be believed; a run where
 * both are non-null would mean the probe is not measuring what it claims.
 *
 * ─── Running it ───
 *
 *   1. Paste the whoami_probe SQL from §12.4 into the Supabase SQL editor.
 *   2. PROBE_EMAIL=you@example.com PROBE_PASSWORD='…' node scripts/probe-rpc-identity.mjs
 *   3. Send the output back, then delete the function:
 *        drop function if exists public.whoami_probe();
 *
 * The password is read from the environment and never written anywhere. Do not
 * put it in a file — docs/HANDOFF-H1.md §7: never commit .env.local, it holds
 * live secrets.
 */
import { readFileSync } from "node:fs";

// .env.local is the normal source on a developer machine; CI and a sandboxed
// container have neither the file nor the keys. Missing is a clean exit with a
// reason, not a stack trace about readFileUtf8 — the same shape
// scripts/check-schema-drift.mjs uses.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // Fall through to the checks below, which name what is missing.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.PROBE_EMAIL;
const password = process.env.PROBE_PASSWORD;

if (!url || !anon || !service) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}
if (!email || !password) {
  console.error("✗ Set PROBE_EMAIL and PROBE_PASSWORD for the account to sign in as.");
  console.error("  PROBE_EMAIL=you@example.com PROBE_PASSWORD='…' node scripts/probe-rpc-identity.mjs");
  process.exit(2);
}

async function callProbe(token, label) {
  const res = await fetch(`${url}/rest/v1/rpc/whoami_probe`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  if (!res.ok) {
    // A missing function is a different answer from a null uid, and reporting
    // one as the other would retire a working design on a typo.
    console.error(`✗ ${label}: ${res.status} ${text}`);
    if (/does not exist|schema cache/i.test(text)) {
      console.error("  The whoami_probe function is not there. Run the SQL from §12.4 first.");
      process.exit(2);
    }
    return null;
  }
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? rows[0] : rows;
}

const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!signIn.ok) {
  console.error(`✗ Could not sign in: ${signIn.status} ${await signIn.text()}`);
  process.exit(2);
}
const { access_token: userToken } = await signIn.json();

const asUser = await callProbe(userToken, "as the signed-in user");
const asService = await callProbe(service, "as the service role");

console.log("\n  as the signed-in user :", JSON.stringify(asUser));
console.log("  as the service role   :", JSON.stringify(asService), "\n");

if (asUser?.uid && !asService?.uid) {
  console.log("✓ auth.uid() resolves under a user JWT and is NULL under the service role.");
  console.log("  Option A works. §12.4 stands and phase 2's gateway is buildable as designed.");
  process.exit(0);
}
if (!asUser?.uid && !asService?.uid) {
  console.error("✗ NULL under both. Option A is falsified — Option B wins by elimination.");
  process.exit(1);
}
console.error("✗ Unexpected: the control did not behave as the document describes.");
console.error("  Do not act on this run; the probe is not measuring what it claims.");
process.exit(1);
