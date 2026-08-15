"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, CalendarDays, Car, Settings, LogOut, BarChart3, FileText, Users, Tag, Percent, Mail } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const allNav = [
  { href: "/admin",               label: "Dashboard",    icon: BarChart3,    adminOnly: true  },
  { href: "/admin/calendar",      label: "Calendar",     icon: CalendarDays, adminOnly: false },
  { href: "/admin/reservations",  label: "Reservations", icon: LayoutGrid,   adminOnly: false },
  { href: "/admin/quotes",        label: "Quotes",       icon: FileText,     adminOnly: false },
  { href: "/admin/customers",     label: "Customers",       icon: Users,    adminOnly: false },
  { href: "/admin/fleet",         label: "Fleet",           icon: Car,      adminOnly: true  },
  { href: "/admin/rates",         label: "Rates",           icon: Settings, adminOnly: true  },
  { href: "/admin/promo-codes",   label: "Promo Codes",     icon: Tag,      adminOnly: true  },
  { href: "/admin/discount-rules",label: "Discounts",       icon: Percent,  adminOnly: true  },
  { href: "/admin/inbox",         label: "Inbox",           icon: Mail,     adminOnly: false },
  { href: "/admin/settings",      label: "Settings",        icon: Settings, adminOnly: true  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Decode role from JWT — handles base64url encoding (- and _ must be replaced)
    function decodeJwtRole(token: string): string | null {
      try {
        const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(b64));
        return (payload?.app_metadata?.role as string) ?? null;
      } catch {
        return null;
      }
    }

    async function resolveRole() {
      // 1. Try refreshSession to get a fresh JWT with latest app_metadata
      const { data: refreshData } = await supabase.auth.refreshSession();
      const freshToken = refreshData?.session?.access_token;
      if (freshToken) {
        const role = decodeJwtRole(freshToken);
        if (role) return role;
      }

      // 2. Try existing session token
      const { data: sessionData } = await supabase.auth.getSession();
      const existingToken = sessionData?.session?.access_token;
      if (existingToken) {
        const role = decodeJwtRole(existingToken);
        if (role) return role;
      }

      // 3. Fallback: ask server (uses service role key, always authoritative)
      try {
        const res = await fetch("/api/admin/me");
        if (res.ok) {
          const json = await res.json();
          if (json.role) return json.role;
        }
      } catch {}

      return "staff";
    }

    resolveRole().then(r => setRole(r));
  }, []);

  if (pathname === "/admin/login" || pathname === "/admin/setup-mfa") {
    return <>{children}</>;
  }

  const isAdmin = role === "admin";
  const nav = allNav.filter(item => !item.adminOnly || isAdmin);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="font-bold text-gray-900 text-sm">Anadyon Rentals</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {role === "admin" ? "Admin" : role === "staff" ? "Staff" : ""}
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 py-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
