"use client";
import { useEffect, useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";

interface PromoCode {
  id: string;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

const EMPTY: Omit<PromoCode, "id" | "used_count" | "created_at"> = {
  code: "",
  description: "",
  type: "percentage",
  value: 10,
  max_uses: null,
  expires_at: null,
  active: true,
};

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/promo-codes").then((r) => r.json()).then((d) => {
      setCodes(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(c: PromoCode) {
    setEditId(c.id);
    setForm({ code: c.code, description: c.description ?? "", type: c.type, value: c.value, max_uses: c.max_uses, expires_at: c.expires_at, active: c.active });
    setShowForm(true);
    setError("");
  }

  function startNew() {
    setEditId(null);
    setForm({ ...EMPTY });
    setShowForm(true);
    setError("");
  }

  async function handleSave() {
    if (!form.code.trim()) { setError("Code is required."); return; }
    setSaving(true);
    setError("");
    const url = editId ? `/api/admin/promo-codes/${editId}` : "/api/admin/promo-codes";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Failed to save."); return; }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await fetch(`/api/admin/promo-codes/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(c: PromoCode) {
    await fetch(`/api/admin/promo-codes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Promo Codes</h1>
        <button onClick={startNew}
          className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition">
          <Plus size={15} /> New code
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">{editId ? "Edit Code" : "New Code"}</h2>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input type="text" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="SUMMER20" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount (€)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
              <input type="number" min="0" step="0.01" value={form.value} onChange={(e) => set("value", parseFloat(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max uses</label>
              <input type="number" min="1" value={form.max_uses ?? ""} onChange={(e) => set("max_uses", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Unlimited" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expires</label>
              <input type="date" value={form.expires_at ?? ""} onChange={(e) => set("expires_at", e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)}
                placeholder="Internal note" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Code</th>
                <th className="text-left px-4 py-3 font-medium">Value</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-center px-4 py-3 font-medium">Used</th>
                <th className="text-left px-4 py-3 font-medium">Expires</th>
                <th className="text-center px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 text-sm">No promo codes yet.</td></tr>
              )}
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="px-5 py-3 font-mono font-semibold text-gray-900">{c.code}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.type === "percentage" ? `${c.value}%` : `€${c.value}`}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.description ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.expires_at ?? "Never"}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(c)}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center mx-auto ${
                        c.active ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                      }`}>
                      {c.active && <Check size={11} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(c)} className="text-gray-400 hover:text-gray-700 mr-2"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
