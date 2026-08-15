import { cookies, headers } from "next/headers";
import AdminLayoutClient from "./AdminLayoutClient";

const ROLE_HEADER = "x-anadyon-role";

/**
 * Reads the role claim out of the Supabase session cookie.
 *
 * This is for NAV DISPLAY ONLY — proxy.ts is what actually enforces access.
 * Decoding locally means an access token that is expired (or that cannot be
 * refreshed here, since a layout cannot write cookies) still yields the right
 * role instead of silently degrading to "staff".
 */
async function roleFromSessionCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
    if (!ref) return null;
    const base = `sb-${ref}-auth-token`;

    // The cookie is split into `.0`, `.1`, … chunks once it exceeds ~3KB.
    const whole = store.get(base)?.value;
    let raw = whole;
    if (!raw) {
      const chunks: string[] = [];
      for (let i = 0; ; i++) {
        const part = store.get(`${base}.${i}`)?.value;
        if (!part) break;
        chunks.push(part);
      }
      if (!chunks.length) return null;
      raw = chunks.join("");
    }

    const encoded = raw.startsWith("base64-") ? raw.slice("base64-".length) : raw;
    const json = raw.startsWith("base64-")
      ? Buffer.from(encoded, "base64url").toString("utf8")
      : decodeURIComponent(encoded);

    const token = JSON.parse(json)?.access_token as string | undefined;
    if (!token) return null;

    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return (payload?.app_metadata?.role as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Primary: the role resolved by proxy.ts, which is the only layer able to
  // refresh auth cookies. It strips the header off the incoming request first,
  // so a client cannot spoof it.
  const headerRole = (await headers()).get(ROLE_HEADER);

  // Fallback for paths the proxy returns early on (e.g. /admin/login).
  const role = headerRole ?? (await roleFromSessionCookie()) ?? "staff";

  return <AdminLayoutClient role={role}>{children}</AdminLayoutClient>;
}
