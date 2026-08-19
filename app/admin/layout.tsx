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
  //
  // Deliberately no "staff" default. That default is what produced the bug
  // where an admin logged in, saw the staff menu, and only got the full one
  // some minutes later: any moment the header was absent or empty, the nav
  // silently asserted "staff" — a confident wrong answer rather than an
  // unknown one.
  //
  // Note `??` alone was not enough either. The proxy can set this header to an
  // empty string, and "" is not nullish, so `headerRole ?? …` would keep the
  // empty value and skip both fallbacks.
  //
  // Any page that renders has already passed the proxy, which now refuses
  // anyone without an explicit admin or staff role — so a missing role here
  // means the header did not arrive, not that the user lacks privilege.
  // Rendering the reduced nav in that case is a display choice, not an
  // access decision; proxy.ts remains the only thing enforcing access.
  const role = headerRole || (await roleFromSessionCookie()) || "";

  return <AdminLayoutClient role={role}>{children}</AdminLayoutClient>;
}
