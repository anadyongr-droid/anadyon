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

  // Primary: service-role admin API — always returns current DB value
  try {
    const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const adminRole = adminUser?.user?.app_metadata?.role as string | undefined;
    if (adminRole) return NextResponse.json({ role: adminRole });
  } catch {}

  // Fallback: role embedded in the validated JWT from getUser()
  const jwtRole = user.app_metadata?.role as string | undefined;
  return NextResponse.json({ role: jwtRole ?? "staff" });
}
