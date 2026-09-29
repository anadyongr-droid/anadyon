import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseRuntimeConfig } from "@/lib/supabaseConfig";

const { url, anon, service } = resolveSupabaseRuntimeConfig();

// Browser client (public routes)
export const supabase = createClient(url, anon);

// Server client with elevated permissions (admin API routes only)
export const supabaseAdmin = createClient(url, service);
