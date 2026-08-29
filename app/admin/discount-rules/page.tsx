"use client";
import { useEffect, useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  type: "early_bird" | "min_stay" | "full_payment" | "age_surcharge";
  threshold: number;
  discount_type: "percentage" | "fixed" | "surcharge";
  value: number;
  pricing_group: string | null;
  active: boolean;
}

const EMPTY: Omit<Rule, "id"> = {
  name: "",
  type: "early_bird",
  threshold: 30,
  discount_type: "percentage",
  value: 10,
  pricing_group: null,
  active: true,
};

const TYPE_LABELS: Record<string, string> = {
  early_bird: "Early bird",
  min_stay: "Minimum stay",
  full_payment: "Full payment upfront",
  age_surcharge: "Age surcharge",
};

const THRESHOLD_LABEL: Record<string, string> = {
  early_bird: "days before pickup",
  min_stay: "minimum days",
  full_payment: "days before pickup",
  age_surcharge: "max driver age",
};

export default function DiscountRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/discount-rules").then((r) => r.json()).then((d) => {
      setRules(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(r: Rule) {
    setEditId(r.id);
    setForm({ name: r.name, type: r.type, threshold: r.threshold, discount_type: r.discount_type, value: r.value, pricing_group: r.pricing_group, active: r.active });
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
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");
    const url = editId ? `/api/admin/discount-rules/${editId}` : "/api/admin/discount-rules";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Failed to save."); return; }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/admin/discount-rules/${id}`, { method: "DELETE" });
    load();
  }

  // A pricing change, not a display preference — turning an active rule off
  // changes what the next customer is quoted. It asks first for the same reason
  // handleDelete does, and says which way it is about to go.
  async function toggleActive(r: Rule) {
    const direction = r.active ? "Turn off" : "Turn on";
    if (!confirm(`${direction} ${r.name}? This changes what customers are charged.`)) return;
    await fetch(`/api/admin/discount-rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    load();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Discount Rules</h1>
          <p className="text-xs text-gray-600 mt-0.5">Early bird, minimum stay, full payment, and age surcharge rules</p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition">
          <Plus size={15} /> New rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">{editId ? "Edit Rule" : "New Rule"}</h2>
            <button onClick={() => setShowForm(false)} aria-label="Close the form"><X size={16} className="text-gray-600" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Book 30 days early" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Threshold ({THRESHOLD_LABEL[form.type]})
              </label>
              <input type="number" min="1" value={form.threshold} onChange={(e) => set("threshold", parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Discount type</label>
              <select value={form.discount_type} onChange={(e) => set("discount_type", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (€)</option>
                <option value="surcharge">Surcharge (€)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
              <input type="number" min="0" step="0.01" value={form.value} onChange={(e) => set("value", parseFloat(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pricing group (optional)</label>
              <select value={form.pricing_group ?? ""} onChange={(e) => set("pricing_group", e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All vehicles</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
              </select>
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
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 admin-table-wrap">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-center px-4 py-3 font-medium">Threshold</th>
                <th className="text-right px-4 py-3 font-medium">Value</th>
                <th className="text-left px-4 py-3 font-medium">Group</th>
                <th className="text-center px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-600 text-sm">No discount rules yet.</td></tr>
              )}
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="px-5 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[r.type]}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{r.threshold}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {r.discount_type === "percentage" ? `${r.value}%` : `€${r.value}`}
                    {r.discount_type === "surcharge" && <span className="text-xs text-orange-500 ml-1">surcharge</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.pricing_group ?? "All"}</td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" onClick={() => toggleActive(r)}
                      role="switch" aria-checked={r.active}
                      aria-label={`${r.active ? "Active" : "Inactive"} — ${r.name}`}
                      title={`${r.active ? "Active" : "Inactive"} — ${r.name}`}
                      className="min-h-11 min-w-11 flex items-center justify-center mx-auto rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
                        <span aria-hidden="true"
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            r.active ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                          }`}>
                          {r.active && <Check size={11} />}
                        </span>
                      </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(r)} aria-label={`Edit ${r.name}`} className="text-gray-600 hover:text-gray-900 mr-2"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(r.id)} aria-label={`Delete rule ${r.name}`} className="text-gray-600 hover:text-red-500"><X size={13} /></button>
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
