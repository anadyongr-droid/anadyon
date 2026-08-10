"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, CalendarDays, Car, Settings, LogOut, BarChart3 } from "lucide-react";

const nav = [
  { href: "/admin",            label: "Dashboard",    icon: BarChart3 },
  { href: "/admin/calendar",   label: "Calendar",     icon: CalendarDays },
  { href: "/admin/reservations", label: "Reservations", icon: LayoutGrid },
  { href: "/admin/fleet",      label: "Fleet",        icon: Car },
  { href: "/admin/rates",      label: "Rates",        icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return <>{children}</>;

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="font-bold text-gray-900 text-sm">Anadyon Rentals</div>
          <div className="text-xs text-gray-400 mt-0.5">Admin Panel</div>
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
