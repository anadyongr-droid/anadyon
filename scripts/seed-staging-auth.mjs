#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

async function allUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 100) return users;
  }
}

export async function seedStagingAuth(env = process.env) {
  const url = env.STAGING_NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Staging URL, anon key and service-role key are required");
  }

  const fixtures = [
    {
      email: env.STAGING_ADMIN_EMAIL || "staging-admin@anadyon.invalid",
      password: env.STAGING_ADMIN_PASSWORD,
      role: "admin",
    },
    {
      email: env.STAGING_STAFF_EMAIL || "staging-staff@anadyon.invalid",
      password: env.STAGING_STAFF_PASSWORD,
      role: "staff",
    },
  ];
  for (const fixture of fixtures) {
    if (!fixture.password) throw new Error(`Missing password for ${fixture.role} fixture`);
    if (!fixture.email.endsWith("@anadyon.invalid")) {
      throw new Error(`${fixture.role} fixture must use the synthetic @anadyon.invalid domain`);
    }
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const existing = await allUsers(admin);

  for (const fixture of fixtures) {
    const current = existing.find((user) => user.email?.toLowerCase() === fixture.email.toLowerCase());
    if (current) {
      const { error } = await admin.auth.admin.updateUserById(current.id, {
        password: fixture.password,
        email_confirm: true,
        app_metadata: { ...current.app_metadata, role: fixture.role },
      });
      if (error) throw error;
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: fixture.email,
        password: fixture.password,
        email_confirm: true,
        app_metadata: { role: fixture.role },
      });
      if (error) throw error;
    }

    const verifier = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await verifier.auth.signInWithPassword({
      email: fixture.email,
      password: fixture.password,
    });
    if (error || !data.user) throw error ?? new Error(`${fixture.role} login verification failed`);
    if (data.user.app_metadata?.role !== fixture.role) {
      throw new Error(`${fixture.role} user has the wrong app_metadata.role`);
    }
    await verifier.auth.signOut();
    console.log(`Verified synthetic ${fixture.role} login and role claim.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedStagingAuth().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
