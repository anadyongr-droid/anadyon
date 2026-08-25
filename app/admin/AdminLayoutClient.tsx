"use client";
import Link from "next/link";
import { RoleProvider } from "./RoleContext";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, CalendarDays, Car, Settings, LogOut, BarChart3, FileText, Users, Tag, Percent, Mail, TrendingUp, Sun, UserCog, Menu, X } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

const allNav = [
  { href: "/admin",               label: "Dashboard",    icon: BarChart3,    adminOnly: true  },
  { href: "/admin/today",         label: "Today",        icon: Sun,          adminOnly: false },
  { href: "/admin/calendar",      label: "Calendar",     icon: CalendarDays, adminOnly: false },
  { href: "/admin/reservations",  label: "Reservations", icon: LayoutGrid,   adminOnly: false },
  { href: "/admin/quotes",        label: "Quotes",       icon: FileText,     adminOnly: false },
  { href: "/admin/customers",     label: "Customers",    icon: Users,        adminOnly: false },
  { href: "/admin/fleet",         label: "Fleet",        icon: Car,          adminOnly: true  },
  { href: "/admin/rates",         label: "Rates",        icon: Settings,     adminOnly: false },
  { href: "/admin/promo-codes",   label: "Promo Codes",  icon: Tag,          adminOnly: true  },
  { href: "/admin/discount-rules",label: "Discounts",    icon: Percent,      adminOnly: true  },
  { href: "/admin/market",        label: "Market",       icon: TrendingUp,   adminOnly: false },
  { href: "/admin/inbox",         label: "Inbox",        icon: Mail,         adminOnly: false },
  { href: "/admin/users",         label: "Users",        icon: UserCog,      adminOnly: true  },
  { href: "/admin/settings",      label: "Settings",     icon: Settings,     adminOnly: true  },
];

export default function AdminLayoutClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // The nav is a permanent rail on a laptop and a drawer on anything narrower.
  // An iPad in portrait is 768px: a 208px rail there costs a quarter of the
  // width on screens that were already too tight for the tables.
  const [navOpen, setNavOpen] = useState(false);

  // Escape closes it, matching the modals.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  if (pathname === "/admin/login" || pathname === "/admin/setup-mfa" || pathname === "/admin/set-password") {
    return <RoleProvider role={role}>{children}</RoleProvider>;
  }

  const isAdmin = role === "admin";
  const nav = allNav.filter(item => !item.adminOnly || isAdmin);

  async function logout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Tap-anywhere-to-close scrim, drawer only. */}
      {navOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bar carrying the menu button. Hidden once the rail is permanent. */}
      <div className="fixed top-0 inset-x-0 h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 z-20 lg:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          className="flex items-center justify-center w-11 h-11 -ml-2 rounded-lg text-gray-600 hover:bg-gray-50 active:bg-gray-100"
        >
          <Menu size={20} />
        </button>
        <span className="font-bold text-gray-900 text-sm">Anadyon Rentals</span>
        <span className="text-xs text-gray-600">{isAdmin ? "Admin" : "Staff"}</span>
      </div>

      <aside
        className={`w-52 bg-white border-r border-gray-200 flex flex-col shrink-0
          fixed inset-y-0 left-0 z-40 transition-transform duration-200 overflow-y-auto
          ${navOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:z-auto`}
      >
        <div className="px-5 py-5 border-b border-gray-100 flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-gray-900 text-sm">Anadyon Rentals</div>
            <div className="text-xs text-gray-600 mt-0.5">
              {isAdmin ? "Admin" : "Staff"}
            </div>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2 rounded-lg text-gray-500 hover:bg-gray-50 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                // Closes the drawer on tap. Doing this here rather than in an
                // effect on pathname avoids a synchronous setState during
                // render, and it is the actual user action that should close it.
                onClick={() => setNavOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
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
      {/*
        min-w-0 is load-bearing: without it a flex child refuses to shrink below
        its content's intrinsic width, so a wide table pushes the whole page
        sideways instead of scrolling inside its own container.
        pt-14 clears the fixed mobile bar; the rail replaces it from lg up.
      */}
      <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0">
        <RoleProvider role={role}>{children}</RoleProvider>
      </main>
    </div>
  );
}
