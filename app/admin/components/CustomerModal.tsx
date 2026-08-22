"use client";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useScrollLock } from "./useScrollLock";
import Select from "./Select";
import SegmentedDateInput from "@/app/components/SegmentedDateInput";
import { validateCustomer, normaliseForStorage, customerStillNeeds } from "@/lib/bookingFields";

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
  // Attribution
  referral_source: string;
  referral_detail: string;
  // Payment — Stripe references only, never a card number
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
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
  referral_source: "",
  referral_detail: "",
  card_brand: null,
  card_last4: null,
  card_exp_month: null,
  card_exp_year: null,
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";
const CURRENT_YEAR = new Date().getFullYear();

export default function CustomerModal({ customer, onClose, onSaved }: Props) {
  useScrollLock();
  const [form, setForm] = useState<Customer>({ ...EMPTY, ...(customer ?? {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!customer?.id;
  const stillNeeds = customerStillNeeds(form);

  function set(key: keyof Customer, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    // Same minimum as a reservation — a customer who cannot be named, invoiced
    // or telephoned is not a usable record.
    const problem = validateCustomer(form);
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError("");
    const url = isEdit ? `/api/admin/customers/${customer!.id}` : "/api/admin/customers";
    const method = isEdit ? "PATCH" : "POST";
    // Blank date inputs arrive as "", which Postgres rejects for a `date`
    // column: `invalid input syntax for type date: ""`. Passport and licence
    // expiry are blank far more often than not.
    const payload = normaliseForStorage({
      ...form,
      full_name: [form.first_name, form.last_name].filter(Boolean).join(" "),
    });
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">{isEdit ? "Edit Customer" : "New Customer"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4 overflow-y-auto overscroll-contain flex-1 min-h-0">

          {/* Personal */}
          <Section title="Personal Information" />
          <Field label="Title">
            <Select value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls}>
              {["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"].map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="First name" required>
            <input type="text" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Surname" required>
            <input type="text" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date of birth">
            <SegmentedDateInput key={form.dob || "customer-dob-blank"} idPrefix="customer-dob" value={form.dob} onChange={(value) => set("dob", value)} minYear={CURRENT_YEAR - 110} maxYear={CURRENT_YEAR - 18} />
          </Field>
          <Field label="Nationality">
            <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputCls} placeholder="e.g. British" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Mobile phone" required>
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
            <SegmentedDateInput key={form.passport_expiry || "passport-expiry-blank"} idPrefix="passport-expiry" value={form.passport_expiry} onChange={(value) => set("passport_expiry", value)} minYear={CURRENT_YEAR - 10} maxYear={CURRENT_YEAR + 20} />
          </Field>
          <Field label="Driving licence number">
            <input type="text" value={form.driving_licence_number} onChange={(e) => set("driving_licence_number", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Licence expiry">
            <SegmentedDateInput key={form.driving_licence_expiry || "licence-expiry-blank"} idPrefix="licence-expiry" value={form.driving_licence_expiry} onChange={(value) => set("driving_licence_expiry", value)} minYear={CURRENT_YEAR - 10} maxYear={CURRENT_YEAR + 20} />
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

          {/* How they found us, and the card on file */}
          <Section title="Attribution & Payment" />
          <Field label="How did they find Anadyon?">
            {/* Free text underneath, so the desk can record what was actually
                said; the options are the common answers, not a closed list. */}
            <Select value={form.referral_source} onChange={(e) => set("referral_source", e.target.value)} className={inputCls}>
              <option value="">— Not asked —</option>
              <option value="google">Google search</option>
              <option value="returning">Returning customer</option>
              <option value="word_of_mouth">Word of mouth / recommendation</option>
              <option value="walk_in">Walk-in / passing</option>
              <option value="social">Social media</option>
              <option value="booking_site">Booking site / OTA</option>
              <option value="hotel">Hotel or villa referral</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Detail (who referred, which site…)">
            <input type="text" value={form.referral_detail} onChange={(e) => set("referral_detail", e.target.value)} className={inputCls} />
          </Field>
          <div className="col-span-2">
            {/* Read-only by design. The card is captured through Stripe's own
                hosted fields, so the number never reaches this application, its
                logs or the database — only a token, the brand and the last four.
                A text input here would invite someone to type a PAN into it. */}
            <div className="border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
              <div className="text-xs font-medium text-gray-600 mb-1">Card on file</div>
              {form.card_last4 ? (
                <div className="text-sm text-gray-800">
                  {form.card_brand ?? "Card"} ···· {form.card_last4}
                  {form.card_exp_month && form.card_exp_year &&
                    <span className="text-gray-400 text-xs ml-2">
                      expires {String(form.card_exp_month).padStart(2, "0")}/{form.card_exp_year}
                    </span>}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No card saved</div>
              )}
              <p className="text-[11px] text-gray-400 mt-1.5">
                Cards are held by Stripe, never in this system. Only the brand and last four digits are stored,
                so staff can identify the card in conversation.
              </p>
            </div>
          </div>

          {/* Preferences & notes */}
          <Section title="Preferences & Notes" />
          <Field label="Preferred vehicle category">
            <Select value={form.preferred_vehicle_category} onChange={(e) => set("preferred_vehicle_category", e.target.value)} className={inputCls}>
              <option value="">— No preference —</option>
              <option value="car">Cars</option>
              <option value="motorbike">Motorbikes</option>
              <option value="bike">Bikes</option>
            </Select>
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

        {/* Named rather than merely absent, matching the reservation form: the
            record saves without these, but the agreement cannot be produced. */}
        {!error && stillNeeds.length > 0 && (
          <div className="mx-6 mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            Saves fine — still missing {stillNeeds.join(", ")}. Needed before the rental agreement.
          </div>
        )}
        {error && (
          <div className="mx-6 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
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
