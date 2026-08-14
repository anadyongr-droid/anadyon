"use client";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";

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
}

interface Props {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: Customer = {
  id: "",
  full_name: "",
  email: "",
  phone: "",
  nationality: "",
  dob: "",
  do_not_rent: false,
  dnr_reason: "",
  notes: "",
};

export default function CustomerModal({ customer, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Customer>(customer ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!customer?.id;

  function set(key: keyof Customer, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError("Full name is required."); return; }
    setSaving(true);
    setError("");
    const url = isEdit ? `/api/admin/customers/${customer!.id}` : "/api/admin/customers";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    setDeleting(true);
    await fetch(`/api/admin/customers/${customer!.id}`, { method: "DELETE" });
    setDeleting(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 pb-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{isEdit ? "Edit Customer" : "New Customer"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
            <input type="text" value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nationality</label>
            <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date of birth</label>
            <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div className="col-span-2 border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={form.do_not_rent}
                onChange={(e) => set("do_not_rent", e.target.checked)}
                className="rounded border-gray-300 accent-red-600" />
              <span className="text-sm font-medium text-red-600">Do Not Rent (DNR)</span>
            </label>
            {form.do_not_rent && (
              <input type="text" value={form.dnr_reason} onChange={(e) => set("dnr_reason", e.target.value)}
                placeholder="Reason for DNR flag"
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm" />
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div>
            {isEdit && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition">
                <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
