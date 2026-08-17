"use client";
import { useState, useRef, useEffect } from "react";
import { DRIVER_AGE_POLICY } from "@/lib/rentalPolicy";
import ReCAPTCHA from "react-google-recaptcha";
import { calcRentalDays, calcVehicleSegments, calcVehicleSubtotal, DEPOSIT_RATE } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup, RateSegment } from "@/lib/pricing";
import DateRangePicker from "./DateRangePicker";
import { TIME_OPTIONS } from "@/lib/bookingFields";
import { translator, localePath, type Locale } from "@/lib/i18n";

const locations = [
  "Zakynthos Airport",
  "Zakynthos Port",
  "Anadyon Office",
];

// Shared with the admin reservation form so staff and customers can never end
// up choosing from different sets of times.
const times = TIME_OPTIONS;

const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Bosnia and Herzegovina", "Brazil", "Bulgaria",
  "Cambodia", "Canada", "Chile", "China", "Colombia", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Ecuador", "Egypt", "Estonia",
  "Finland", "France", "Georgia", "Germany", "Ghana", "Greece",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait",
  "Latvia", "Lebanon", "Lithuania", "Luxembourg",
  "Malaysia", "Malta", "Mexico", "Moldova", "Montenegro", "Morocco",
  "Netherlands", "New Zealand", "Nigeria", "North Macedonia", "Norway",
  "Oman", "Pakistan", "Palestine", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain", "Sweden", "Switzerland",
  "Thailand", "Tunisia", "Turkey",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
  "Venezuela", "Vietnam", "Other",
];

function localDateStr(d = new Date()) {
  return d.toLocaleDateString("sv");
}
const today = localDateStr();
const tomorrow = localDateStr(new Date(Date.now() + 86400000));
const currentYear = new Date().getFullYear();

const DOB_MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" }, { value: "03", label: "March" },
  { value: "04", label: "April" }, { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" }, { value: "09", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];
function daysInDobMonth(month: string, year: string): number {
  if (!month) return 31;
  return new Date(Number(year || currentYear), Number(month), 0).getDate();
}

type FieldKey = "firstName" | "lastName" | "email" | "dob" | "mobileTel" | "terms" | "captcha";
const invalidFieldClass = "border-red-500 dark:border-red-500 ring-1 ring-red-500";

type Props = {
  vehicleType: string;
  models: string[];
  initialModel?: string;
  modelPricingGroups?: Record<string, string>;
  locale?: Locale;
  modelTransmissions?: Record<string, string>;
};

// Defined at module scope: declaring a component inside the render body makes
// React remount the whole modal subtree on every parent render.
function TermsModal({ onClose, locale = "en" }: { onClose: () => void; locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white">Vehicle Reservation Terms & Conditions</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5 text-sm text-gray-700 dark:text-gray-300">
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Driver&apos;s Licence</h3><p>A valid driving licence recognised by the Greek authorities must be held by the driver.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Driver&apos;s Age</h3><p>{DRIVER_AGE_POLICY}</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Credit Card</h3><p>{tr("form.creditCard")}</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Delivery / Collection Fees</h3><p>All deliveries and collections at the Airport, Zakynthos Port and our Office during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Unlimited Mileage</h3><p>Unlimited mileage applies to all rentals.</p></div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Insurance</h3>
            <p>All our rentals include:</p>
            <ul className="list-disc ml-5 mt-1 space-y-1"><li>Third party insurance</li><li>Theft insurance</li><li>{tr("extra.cdw")}</li></ul>
            <p className="mt-2">Additional cover such as Full Damage Waiver (FDW) is available for an additional fee. Bicycles are not covered by the above.</p>
          </div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">7. Cancellation</h3><p>All cancellations received more than 24 hours prior to the start of the rental are free of charge. All other cancellations will be subject to one day&apos;s rental charge.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">8. Taxes</h3><p>{tr("form.vatNote")}</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">9. Road Assistance</h3><p>We provide free 24-hour roadside assistance.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">10. Customer Service</h3><p>Our staff will go above and beyond to ensure you get a hassle-free rental experience. For any additional information please contact us.</p></div>
        </div>
        <div className="p-6 border-t dark:border-gray-700">
          <button onClick={onClose} className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function BookingForm({ vehicleType, models, initialModel, modelPricingGroups, modelTransmissions, locale = "en" }: Props) {
  const tr = translator(locale);
  const formRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const [selectedModel, setSelectedModel] = useState(initialModel ?? models[0]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [extrasConfig, setExtrasConfig] = useState<ExtrasConfig[]>([]);

  useEffect(() => {
    if (!modelPricingGroups) return;
    fetch("/api/admin/rates").then(r => r.json()).then(({ rates: r, extras: e }) => {
      setRates(r ?? []);
      setExtrasConfig(e ?? []);
    });
  }, []);

  const [differentDropoff, setDifferentDropoff] = useState(false);
  const [pickupDate, setPickupDate] = useState(today);
  const [dropoffDate, setDropoffDate] = useState(tomorrow);
  const [pickupLocation, setPickupLocation] = useState(locations[0]);
  const [dropoffLocation, setDropoffLocation] = useState(locations[0]);
  const [pickupTime, setPickupTime] = useState("09:00");
  const [dropoffTime, setDropoffTime] = useState("09:00");
  const transmission = modelTransmissions?.[selectedModel] ?? null;
  const [driverAge, setDriverAge] = useState("26–65");
  const [babySeat, setBabySeat] = useState("0");
  const [childSeat, setChildSeat] = useState("0");
  const [fdw, setFdw] = useState(false);
  const [additionalDrivers, setAdditionalDrivers] = useState("0");

  const [title, setTitle] = useState("Mr");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const dob = dobDay && dobMonth && dobYear ? `${dobYear}-${dobMonth}-${dobDay}` : "";
  const dobDayOptions = Array.from({ length: daysInDobMonth(dobMonth, dobYear) }, (_, i) => String(i + 1).padStart(2, "0"));
  const dobYearOptions = Array.from({ length: 100 }, (_, i) => String(currentYear - 18 - i));
  function handleDobMonthChange(value: string) {
    setDobMonth(value);
    const max = daysInDobMonth(value, dobYear);
    if (dobDay && Number(dobDay) > max) setDobDay(String(max).padStart(2, "0"));
  }
  function handleDobYearChange(value: string) {
    setDobYear(value);
    const max = daysInDobMonth(dobMonth, value);
    if (dobDay && Number(dobDay) > max) setDobDay(String(max).padStart(2, "0"));
  }
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Greece");
  const [mobileTel, setMobileTel] = useState("");
  const [landlineTel, setLandlineTel] = useState("");
  const [comments, setComments] = useState("");
  const [terms, setTerms] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [quoteRef, setQuoteRef] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, boolean>>>({});
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const dobFieldRef = useRef<HTMLDivElement>(null);
  const mobileTelRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const captchaFieldRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<FieldKey, React.RefObject<HTMLElement | null>> = {
    firstName: firstNameRef, lastName: lastNameRef, email: emailRef,
    dob: dobFieldRef, mobileTel: mobileTelRef, terms: termsRef, captcha: captchaFieldRef,
  };
  function clearFieldError(key: FieldKey) {
    setFieldErrors(prev => (prev[key] ? { ...prev, [key]: false } : prev));
  }
  const [showTerms, setShowTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // Promo code
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<{ valid: boolean; code?: string; id?: string; discount_amount?: number; description?: string; error?: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const promoDiscount = promoResult?.valid ? (promoResult.discount_amount ?? 0) : 0;

  // Live price calculation
  const pricingGroup = modelPricingGroups?.[selectedModel];
  const rentalDays = pickupDate && dropoffDate ? calcRentalDays(pickupDate, dropoffDate, pickupTime, dropoffTime) : 0;
  const rateSegments: RateSegment[] = pricingGroup && pickupDate && dropoffDate && rentalDays && rates.length
    ? calcVehicleSegments(rates, pricingGroup as PricingGroup, pickupDate, dropoffDate, rentalDays)
    : [];
  const dailyRate = rateSegments.length === 1 ? rateSegments[0].rate : 0;
  const vehicleSubtotal = pricingGroup && pickupDate && dropoffDate && rentalDays && rates.length
    ? calcVehicleSubtotal(rates, pricingGroup as PricingGroup, pickupDate, dropoffDate, rentalDays)
    : 0;
  const xRate = (key: string, fallback: number) =>
    extrasConfig.find(e => e.key === key)?.daily_rate ?? fallback;
  const extrasSubtotal = rentalDays
    ? parseFloat((
        (fdw ? xRate("fdw", 5) : 0) * rentalDays +
        Number(babySeat) * xRate("baby_seat", 3) * rentalDays +
        Number(childSeat) * xRate("child_seat", 3) * rentalDays +
        Number(additionalDrivers) * xRate("additional_drivers", 2.5) * rentalDays
      ).toFixed(2))
    : 0;
  const subtotalBeforePromo = parseFloat((vehicleSubtotal + extrasSubtotal).toFixed(2));
  const total = parseFloat(Math.max(0, subtotalBeforePromo - promoDiscount).toFixed(2));
  const deposit = parseFloat((total * DEPOSIT_RATE).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    const res = await fetch("/api/promo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promoInput, total: subtotalBeforePromo }),
    });
    const data = await res.json();
    setPromoResult(data);
    setPromoChecking(false);
  }
  const showPrice = !!(pricingGroup && rentalDays > 0 && vehicleSubtotal > 0);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleContinue() {
    setStepError(null);
    if (!pickupDate || !dropoffDate) {
      setStepError("Please select your rental dates.");
      return;
    }
    if (rentalDays <= 0) {
      setStepError("Return date must be after pick-up date.");
      return;
    }
    setStep(2);
    setTimeout(scrollToForm, 50);
  }

  function handleBack() {
    setFieldErrors({});
    setStep(1);
    setTimeout(scrollToForm, 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<FieldKey, boolean>> = {};
    if (!firstName.trim()) errors.firstName = true;
    if (!lastName.trim()) errors.lastName = true;
    if (!email.trim()) errors.email = true;
    if (!dob) errors.dob = true;
    if (!mobileTel.trim()) errors.mobileTel = true;
    if (!terms) errors.terms = true;
    if (!captchaToken) errors.captcha = true;
    setFieldErrors(errors);
    const firstInvalid = (Object.keys(errors) as FieldKey[])[0];
    if (firstInvalid) {
      const el = fieldRefs[firstInvalid].current;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement & { focus?: () => void })?.focus?.();
      return;
    }

    setStatus("sending");
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captchaToken,
        vehicleType,
        selectedModel,
        pricingGroup: pricingGroup ?? null,
        pickupLocation,
        dropoffLocation: differentDropoff ? dropoffLocation : pickupLocation,
        pickupDate,
        pickupTime,
        dropoffDate,
        dropoffTime,
        transmission: vehicleType === "Cars" ? transmission : undefined,
        driverAge,
        babySeat,
        childSeat,
        fdw,
        additionalDrivers,
        rentalDays,
        dailyRate,
        vehicleSubtotal,
        extrasSubtotal,
        total,
        deposit,
        balanceDue,
        promoCode: promoResult?.valid ? promoResult.code : undefined,
        promoCodeId: promoResult?.valid ? promoResult.id : undefined,
        discountAmount: promoResult?.valid ? promoResult.discount_amount : undefined,
        extrasLines: [
          ...(fdw ? [{ label: `Full Damage Waiver (FDW) — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("fdw", 5).toFixed(2)}`, amount: (xRate("fdw", 5) * rentalDays).toFixed(2) }] : []),
          ...(Number(babySeat) > 0 ? [{ label: `Baby Seat ×${babySeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("baby_seat", 3).toFixed(2)}`, amount: (xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2) }] : []),
          ...(Number(childSeat) > 0 ? [{ label: `Child Seat ×${childSeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("child_seat", 3).toFixed(2)}`, amount: (xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2) }] : []),
          ...(Number(additionalDrivers) > 0 ? [{ label: `Additional Driver ×${additionalDrivers} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("additional_drivers", 2.5).toFixed(2)}`, amount: (xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2) }] : []),
        ],
        title,
        firstName,
        lastName,
        email,
        dob,
        address,
        postalCode,
        city,
        country,
        mobileTel,
        landlineTel,
        comments,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuoteRef(data.ref ?? null);
      setStatus("sent");
    } else {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-8 shadow-sm text-center space-y-3">
        <h2 className="text-xl font-semibold text-green-600">Request Sent!</h2>
        {quoteRef && (
          <p className="text-gray-700 dark:text-gray-300">
            Your reference number is{" "}
            <span className="font-mono font-bold text-gray-900 dark:text-white">{quoteRef}</span>
          </p>
        )}
        <p className="text-gray-600 dark:text-gray-400">We will contact you as soon as possible with availability and pricing. A confirmation has been sent to your email.</p>
        {quoteRef && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You can view your quote at any time at{" "}
            <a href={`/quote/${quoteRef}`} className="text-blue-700 dark:text-blue-400 underline font-medium">/quote/{quoteRef}</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {showTerms && <TermsModal locale={locale} onClose={() => setShowTerms(false)} />}
      <div ref={formRef} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-sm scroll-mt-[168px]">

        {/* Step indicator */}
        <div className="flex items-center border-b dark:border-gray-700 px-8 py-4 gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step === 1 ? "bg-orange-600 text-white" : "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"}`}>1</span>
            <span className={`text-sm font-medium ${step === 1 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>{tr("form.stepRental")}</span>
          </div>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step === 2 ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500"}`}>2</span>
            <span className={`text-sm font-medium ${step === 2 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>{tr("form.stepDetails")}</span>
          </div>
        </div>

        {/* ── STEP 1: Rental details ── */}
        {step === 1 && (
          <div className="p-8 space-y-6">
            <h2 className="text-xl font-semibold dark:text-white">{tr("form.stepQuote")}</h2>

            {/* Vehicle Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.vehicle")}</label>
              <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {models.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {/* Pick-up Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.pickupLocation")}</label>
              <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={pickupLocation} onChange={e => setPickupLocation(e.target.value)}>
                {locations.map(l => <option key={l}>{l}</option>)}
              </select>
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
                <input type="checkbox" checked={differentDropoff} onChange={() => setDifferentDropoff(!differentDropoff)} className="rounded" />
                Return at a different location
              </label>
            </div>

            {/* Drop-off Location */}
            {differentDropoff && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.dropoffLocation")}</label>
                <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={dropoffLocation} onChange={e => setDropoffLocation(e.target.value)}>
                  {locations.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            )}

            {/* Dates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr("form.rentalDates")}</label>
              <DateRangePicker
                pickupDate={pickupDate}
                returnDate={dropoffDate}
                onPickupChange={setPickupDate}
                onReturnChange={setDropoffDate}
              />
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.pickupTime")}</label>
                <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={pickupTime} onChange={e => setPickupTime(e.target.value)}>
                  {times.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.returnTime")}</label>
                <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={dropoffTime} onChange={e => setDropoffTime(e.target.value)}>
                  {times.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>


            {/* Driver Age */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.driverAge")}</label>
              <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={driverAge} onChange={e => setDriverAge(e.target.value)}>
                <option>21–25</option>
                <option>26–65</option>
                <option>66+</option>
              </select>
            </div>

            {/* Extras — cars only */}
            {vehicleType === "Cars" && (
              <div className="border-t dark:border-gray-700 pt-6">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">{tr("form.extras")}</h3>
                <div className="border dark:border-gray-600 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-3">{tr("form.description")}</th>
                        <th className="text-center px-4 py-3">{tr("form.pricePerDay")}</th>
                        <th className="text-center px-4 py-3">{tr("form.selection")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tr("extra.babySeat")}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("baby_seat", 3).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={babySeat} onChange={e => setBabySeat(e.target.value)}>
                            <option>0</option><option>1</option><option>2</option><option>3</option>
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tr("extra.childSeat")}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("child_seat", 3).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={childSeat} onChange={e => setChildSeat(e.target.value)}>
                            <option>0</option><option>1</option><option>2</option><option>3</option>
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tr("extra.fdw")}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("fdw", 5).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={fdw} onChange={e => setFdw(e.target.checked)} className="rounded" />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tr("extra.additionalDrivers")}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("additional_drivers", 2.5).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={additionalDrivers} onChange={e => setAdditionalDrivers(e.target.value)}>
                            <option>0</option><option>1</option><option>2</option><option>3</option>
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Price Estimate */}
            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">{tr("form.priceEstimate")}</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{selectedModel} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{rentalDays > 0 ? (vehicleSubtotal / rentalDays).toFixed(2) : "0.00"}/day</span>
                    <span>€{vehicleSubtotal.toFixed(2)}</span>
                  </div>
                  {fdw && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Full Damage Waiver — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{xRate("fdw", 5).toFixed(2)}</span>
                      <span>€{(xRate("fdw", 5) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(babySeat) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Baby Seat ×{babySeat} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{xRate("baby_seat", 3).toFixed(2)}</span>
                      <span>€{(xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(childSeat) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Child Seat ×{childSeat} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{xRate("child_seat", 3).toFixed(2)}</span>
                      <span>€{(xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(additionalDrivers) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Additional Driver ×{additionalDrivers} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{xRate("additional_drivers", 2.5).toFixed(2)}</span>
                      <span>€{(xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>Promo code ({promoResult?.code})</span>
                      <span>−€{promoDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-blue-200 dark:border-blue-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
                    <span>{tr("form.total")}</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>{tr("form.depositDue")}</span>
                    <span>€{deposit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>{tr("form.balanceDue")}</span>
                    <span>€{balanceDue.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">Final price confirmed upon booking. Includes VAT, extras &amp; all taxes.</p>

                {/* Promo code */}
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                  {promoResult?.valid ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600 dark:text-green-400 font-medium">✓ Code &ldquo;{promoResult.code}&rdquo; applied</span>
                      <button onClick={() => { setPromoResult(null); setPromoInput(""); }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline">Remove</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoResult(null); }}
                        onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                        placeholder="Promo code"
                        className="flex-1 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-blue-900 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                      <button onClick={applyPromo} disabled={promoChecking || !promoInput.trim()}
                        className="px-3 py-1.5 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-50 transition">
                        {promoChecking ? "…" : "Apply"}
                      </button>
                    </div>
                  )}
                  {promoResult && !promoResult.valid && (
                    <p className="text-xs text-red-500 mt-1">{promoResult.error}</p>
                  )}
                </div>
              </div>
            )}

            {stepError && (
              <p className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{stepError}</p>
            )}

            <button
              type="button"
              onClick={handleContinue}
              className="w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Your details ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <h2 className="text-xl font-semibold dark:text-white">{tr("form.stepDetails")}</h2>

            {/* Booking summary */}
            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 max-w-sm">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <p className="font-semibold text-blue-900 dark:text-blue-100">
                    {selectedModel}
                    <span className="ml-2 inline-block bg-orange-600 text-white text-xs font-semibold rounded-full px-2 py-0.5 align-middle">{rentalDays} day{rentalDays > 1 ? "s" : ""}</span>
                  </p>
                  <p className="text-xl font-bold text-blue-900 dark:text-blue-100 flex-shrink-0">€{total.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-blue-200 dark:bg-blue-700 rounded-lg overflow-hidden mb-2">
                  <div className="bg-blue-50 dark:bg-blue-950 pr-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Pick-up</p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-0.5">
                      {new Date(pickupDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 pl-3 py-2 text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Return</p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-0.5">
                      {new Date(dropoffDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                {transmission && (
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Transmission: <span className="font-semibold text-blue-700 dark:text-blue-300">{transmission}</span></p>
                )}
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Deposit €{deposit.toFixed(2)} due on confirmation</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.title")}</label>
                  <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={title} onChange={e => setTitle(e.target.value)}>
                    <option>Mr</option><option>Mrs</option><option>Ms</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                  <input ref={firstNameRef} type="text" value={firstName} onChange={e => { setFirstName(e.target.value); clearFieldError("firstName"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.firstName ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder="First name" />
                  {fieldErrors.firstName && <p className="text-red-500 text-xs mt-1">{tr("err.firstName")}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input ref={lastNameRef} type="text" value={lastName} onChange={e => { setLastName(e.target.value); clearFieldError("lastName"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.lastName ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder="Last name" />
                  {fieldErrors.lastName && <p className="text-red-500 text-xs mt-1">{tr("err.lastName")}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                  <input ref={emailRef} type="email" value={email} onChange={e => { setEmail(e.target.value); clearFieldError("email"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.email ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder="your@email.com" />
                  {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{tr("err.email")}</p>}
                </div>
                <div ref={dobFieldRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={dobDay} onChange={e => { setDobDay(e.target.value); clearFieldError("dob"); }} className={`border rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ${fieldErrors.dob ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`}>
                      <option value="">Day</option>
                      {dobDayOptions.map(d => <option key={d} value={d}>{Number(d)}</option>)}
                    </select>
                    <select value={dobMonth} onChange={e => { handleDobMonthChange(e.target.value); clearFieldError("dob"); }} className={`border rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ${fieldErrors.dob ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`}>
                      <option value="">{tr("form.month")}</option>
                      {DOB_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select value={dobYear} onChange={e => { handleDobYearChange(e.target.value); clearFieldError("dob"); }} className={`border rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ${fieldErrors.dob ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`}>
                      <option value="">Year</option>
                      {dobYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {fieldErrors.dob && <p className="text-red-500 text-xs mt-1">{tr("err.dob")}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.address")}</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Street address" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.postalCode")}</label>
                  <input type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Postal code" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.city")}</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="City" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.country")}</label>
                  <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={country} onChange={e => setCountry(e.target.value)}>
                    <option>Greece</option>
                    <optgroup label="─────────────">
                      {countries.filter(c => c !== "Greece").map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile *</label>
                  <input ref={mobileTelRef} type="tel" value={mobileTel} onChange={e => { setMobileTel(e.target.value); clearFieldError("mobileTel"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.mobileTel ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder="+30 or international" />
                  {fieldErrors.mobileTel && <p className="text-red-500 text-xs mt-1">{tr("err.mobile")}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.landline")}</label>
                  <input type="tel" value={landlineTel} onChange={e => setLandlineTel(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Optional" />
                </div>
              </div>
              <div className="hidden">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hotel</label>
                <input type="text" className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.comments")}</label>
                <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Any special requests?" />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">* Required fields</p>
              </div>
            </div>

            {/* Terms */}
            <div ref={termsRef} className="flex items-start gap-3">
              <input type="checkbox" id="terms" checked={terms} onChange={e => { setTerms(e.target.checked); clearFieldError("terms"); }} className={`mt-1 rounded ${fieldErrors.terms ? "ring-2 ring-red-500" : ""}`} />
              <div>
                <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400">
                  I accept the{" "}
                  <button type="button" onClick={() => setShowTerms(true)} className="text-orange-600 hover:underline font-medium cursor-pointer">Terms & Conditions</button>
                </label>
                {fieldErrors.terms && <p className="text-red-500 text-xs mt-1">{tr("err.terms")}</p>}
              </div>
            </div>

            {/* reCAPTCHA */}
            <div ref={captchaFieldRef} className="w-full overflow-hidden">
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey="6Lc_mjwtAAAAAKDT-iW8Lu9rql51ldO87Y9NQCvL"
                onChange={(token: string | null) => { setCaptchaToken(token); clearFieldError("captcha"); }}
                onExpired={() => setCaptchaToken(null)}
              />
              {fieldErrors.captcha && <p className="text-red-500 text-xs mt-1">{tr("err.recaptcha")}</p>}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                This site is protected by reCAPTCHA and the Google{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Privacy Policy</a>{" "}
                and{" "}
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Terms of Service</a>{" "}
                apply.
              </p>
            </div>

            {status === "error" && (
              <p className="text-red-500 text-sm">Something went wrong. Please try again or contact us directly.</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={status === "sending"}
                className="flex-2 w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
              >
                {status === "sending" ? "Sending..." : "Get Quote"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
