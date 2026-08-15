"use client";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";

interface Customer {
  id: string;
  // Personal
  title: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  phone_alt: string;
  nationality: string;
  dob: string;
  // Address
  address: string;
  city: string;
  postal_code: string;
  country: string;
  // Identity documents
  passport_number: string;
  passport_expiry: string;
  driving_licence_number: string;
  driving_licence_expiry: string;
  driving_licence_country: string;
  // Emergency contact
  emergency_contact_name: string;
  emergency_contact_phone: string;
  // Tax
  vat_number: string;
  // Rental preferences
  preferred_vehicle_category: string;
  // Internal
  do_not_rent: boolean;
  dnr_reason: string;
  notes: string;
}

interface Props {
  customer?: Partial<Customer>;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: Customer = {
  id: "",
  title: "Mr",
  first_name: "",
  last_name: "",
  full_name: "",
  email: "",
  phone: "",
  phone_alt: "",
  nationality: "",
  dob: "",
  address: "",
  city: "",
  postal_code: "",
  country: "",
  passport_number: "",
  passport_expiry: "",
  driving_licence_number: "",
  driving_licence_expiry: "",
  driving_licence_country: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  vat_number: "",
  preferred_vehicle_category: "",
  do_not_rent: false,
  dnr_reason: "",
  notes: "",
};

function Section({ title }: { title: string }) {
  return (
    <div className="col-span-2 border-t border-gray-100 pt-4 mt-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

export default function CustomerModal({ customer, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Customer>({ ...EMPTY, ...(customer ?? {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!customer?.id;

  function set(key: keyof Customer, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    setSaving(true);
    setError("");
    const url = isEdit ? `/api/admin/customers/${customer!.id}` : "/api/admin/customers";
    const method = isEdit ? "PATCH" : "POST";
    const payload = { ...form, full_name: [form.first_name, form.last_name].filter(Boolean).join(" ") };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-6 pb-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{isEdit ? "Edit Customer" : "New Customer"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">

          {/* Personal */}
          <Section title="Personal Information" />
          <Field label="Title">
            <select value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls}>
              {["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="First name *">
            <input type="text" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Surname">
            <input type="text" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Nationality">
            <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputCls} placeholder="e.g. British" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Mobile phone">
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="+30..." />
          </Field>
          <Field label="Alternative phone">
            <input type="tel" value={form.phone_alt} onChange={(e) => set("phone_alt", e.target.value)} className={inputCls} />
          </Field>

          {/* Address */}
          <Section title="Address" />
          <div className="col-span-2">
            <Field label="Street address">
              <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="City">
            <input type="text" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Postal code">
            <input type="text" value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} className={inputCls} />
          </Field>
          <div className="col-span-2">
            <Field label="Country">
              <input type="text" value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls} placeholder="e.g. United Kingdom" />
            </Field>
          </div>

          {/* Documents */}
          <Section title="Identity Documents" />
          <Field label="Passport number">
            <input type="text" value={form.passport_number} onChange={(e) => set("passport_number", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Passport expiry">
            <input type="date" value={form.passport_expiry} onChange={(e) => set("passport_expiry", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Driving licence number">
            <input type="text" value={form.driving_licence_number} onChange={(e) => set("driving_licence_number", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Licence expiry">
            <input type="date" value={form.driving_licence_expiry} onChange={(e) => set("driving_licence_expiry", e.target.value)} className={inputCls} />
          </Field>
          <div className="col-span-2">
            <Field label="Licence issuing country">
              <input type="text" value={form.driving_licence_country} onChange={(e) => set("driving_licence_country", e.target.value)} className={inputCls} placeholder="e.g. United Kingdom" />
            </Field>
          </div>

          {/* Emergency contact */}
          <Section title="Emergency Contact" />
          <Field label="Contact name">
            <input type="text" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Contact phone">
            <input type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={inputCls} />
          </Field>

          {/* Tax / invoicing */}
          <Section title="Tax & Invoicing" />
          <Field label="VAT number (for B2B invoices)">
            <input type="text" value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} className={inputCls} placeholder="e.g. EL123456789" />
          </Field>
          <div /> {/* spacer */}

          {/* Preferences & notes */}
          <Section title="Preferences & Notes" />
          <Field label="Preferred vehicle category">
            <select value={form.preferred_vehicle_category} onChange={(e) => set("preferred_vehicle_category", e.target.value)} className={inputCls}>
              <option value="">— No preference —</option>
              <option value="car">Cars</option>
              <option value="motorbike">Motorbikes</option>
              <option value="bike">Bikes</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Internal notes">
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                className={`${inputCls} resize-none`} />
            </Field>
          </div>

          {/* DNR */}
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
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">Cancel</button>
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
