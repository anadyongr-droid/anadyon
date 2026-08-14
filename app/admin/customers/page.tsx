"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Search, AlertTriangle } from "lucide-react";
import CustomerModal from "../components/CustomerModal";

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  nationality: string;
  dob: string;
  do_not_rent: boolean;
  dnr_reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ customer?: Customer } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    fetch(`/api/admin/customers${params}`)
      .then((r) => r.json())
      .then((d) => { setCustomers(Array.isArray(d) ? d : []); setLoading(false); });
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Customers</h1>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition"
        >
          <Plus size={15} /> New customer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Nationality</th>
                <th className="text-left px-4 py-3 font-medium">Added</th>
                <th className="text-center px-4 py-3 font-medium">DNR</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">No customers found.</td></tr>
              )}
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer"
                  onClick={() => setModal({ customer: c })}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{c.full_name}</span>
                      {c.do_not_rent && (
                        <AlertTriangle size={13} className="text-red-500 shrink-0" title={c.dnr_reason ?? "Do Not Rent"} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.nationality ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString("el-GR")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.do_not_rent && (
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">DNR</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <CustomerModal
          customer={modal.customer}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
