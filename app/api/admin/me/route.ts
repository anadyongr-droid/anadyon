import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET() {
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
  if (!user) return NextResponse.json({ role: null }, { status: 401 });

  // Use service role admin API to get authoritative app_metadata (bypasses JWT caching)
  const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
  const role = (adminUser?.user?.app_metadata?.role as string | undefined) ?? "staff";
  return NextResponse.json({ role });
}
