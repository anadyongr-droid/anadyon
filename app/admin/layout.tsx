import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";
import AdminLayoutClient from "./AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role = "staff";

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Primary: service role admin API — always reads current DB value, not JWT cache
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
      role =
        (adminUser?.user?.app_metadata?.role as string | undefined) ??
        (user.app_metadata?.role as string | undefined) ??
        "staff";
    }
  } catch {
    // On any error, fall back to "staff" (safe default)
  }

  return <AdminLayoutClient role={role}>{children}</AdminLayoutClient>;
}
