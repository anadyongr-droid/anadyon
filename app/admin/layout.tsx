import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";
import AdminLayoutClient from "./AdminLayoutClient";

const ROLE_HEADER = "x-anadyon-role";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Primary: the role resolved by proxy.ts. Only the proxy can refresh auth
  // cookies, so it is the one place that reliably sees the current session.
  const headerRole = (await headers()).get(ROLE_HEADER);
  if (headerRole) {
    return <AdminLayoutClient role={headerRole}>{children}</AdminLayoutClient>;
  }

  // Fallback for any path the proxy did not annotate (e.g. /admin/login).
  let role = "staff";
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
      role =
        (adminUser?.user?.app_metadata?.role as string | undefined) ??
        (user.app_metadata?.role as string | undefined) ??
        "staff";
    }
  } catch {
    // safe default
  }

  return <AdminLayoutClient role={role}>{children}</AdminLayoutClient>;
}
