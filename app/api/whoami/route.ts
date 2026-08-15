import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// TEMPORARY DIAGNOSTIC — reports only on the caller's own session. Remove after debugging.
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    out.cookieNames = all.map(c => c.name);
    out.cookieCount = all.length;
    out.authCookieSizes = all
      .filter(c => c.name.includes("auth-token"))
      .map(c => ({ name: c.name, len: c.value.length }));

    out.env = {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      servicePrefix: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(0, 10),
      anonPrefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").slice(0, 10),
    };

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

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    out.getUserError = userErr?.message ?? null;
    out.userId = userData?.user?.id ?? null;
    out.userEmail = userData?.user?.email ?? null;
    out.jwtAppMetadata = userData?.user?.app_metadata ?? null;
    out.jwtRole = userData?.user?.app_metadata?.role ?? null;

    if (userData?.user) {
      try {
        const { supabaseAdmin } = await import("@/lib/supabase");
        const { data: adminUser, error: adminErr } =
          await supabaseAdmin.auth.admin.getUserById(userData.user.id);
        out.adminApiError = adminErr?.message ?? null;
        out.adminApiRole = adminUser?.user?.app_metadata?.role ?? null;
      } catch (e) {
        out.adminApiThrew = e instanceof Error ? e.message : String(e);
      }
    }

    // Exact layout.tsx computation
    let computed = "staff";
    try {
      if (userData?.user) {
        const { supabaseAdmin } = await import("@/lib/supabase");
        const { data: au } = await supabaseAdmin.auth.admin.getUserById(userData.user.id);
        computed =
          (au?.user?.app_metadata?.role as string | undefined) ??
          (userData.user.app_metadata?.role as string | undefined) ??
          "staff";
      }
    } catch (e) {
      out.computeThrew = e instanceof Error ? e.message : String(e);
    }
    out.computedRole = computed;
  } catch (e) {
    out.fatal = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
