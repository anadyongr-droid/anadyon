import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A user-scoped client for identity-verifying handover gateways.
 *
 * These gateways read `auth.uid()` and verify the caller against server-owned
 * app metadata. A service-role call has no end-user identity and fails closed.
 */
export async function handoverGatewayClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
}

/** The staff member acting, used while opening a draft through the service role. */
export async function handoverActorId(): Promise<string | null> {
  try {
    const supabase = await handoverGatewayClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
