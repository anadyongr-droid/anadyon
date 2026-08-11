"use client";
import { useState, useRef, useEffect } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { calcRentalDays, getDailyRate, calcExtrasTotal, buildExtrasLineItems, DEPOSIT_RATE } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup } from "@/lib/pricing";
import DateRangePicker from "./DateRangePicker";

const locations = [
  "Zakynthos Airport",
  "Zakynthos Port",
  "Anadyon Office",
];

const times = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

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
  return d.toLocaleDateString("sv"); // 'sv' locale → YYYY-MM-DD in local time
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
// Number of days in a given month/year — falls back to 31 until both are picked, then clamps as needed.
function daysInDobMonth(month: string, year: string): number {
  if (!month) return 31;
  return new Date(Number(year || currentYear), Number(month), 0).getDate();
}

type FieldKey = "firstName" | "lastName" | "email" | "dob" | "mobileTel" | "terms" | "captcha";

const FIELD_MESSAGES: Record<FieldKey, string> = {
  firstName: "First name is required.",
  lastName: "Last name is required.",
  email: "Email address is required.",
  dob: "Date of birth is required.",
  mobileTel: "Mobile number is required.",
  terms: "Please accept the Terms & Conditions.",
  captcha: "Please complete the reCAPTCHA verification.",
};
const invalidFieldClass = "border-red-500 dark:border-red-500 ring-1 ring-red-500";

type Props = {
  vehicleType: string;
  models: string[];
  initialModel?: string;
  modelPricingGroups?: Record<string, string>;
};

export default function BookingForm({ vehicleType, models, initialModel, modelPricingGroups }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
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
  const [transmission, setTransmission] = useState("Any");
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
  const dobDayOptions = Array.from({ length: daysInDobMonth(dobMonth, dobYear) }, (_, i) => String(i + 1).padStart(2, "0"));
  const dobYearOptions = Array.from({ length: 100 }, (_, i) => String(currentYear - 18 - i));
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [showTerms, setShowTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const dobFieldRef = useRef<HTMLDivElement>(null);
  const mobileTelRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const captchaFieldRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<FieldKey, React.RefObject<HTMLElement | null>> = {
    firstName: firstNameRef,
    lastName: lastNameRef,
    email: emailRef,
    dob: dobFieldRef,
    mobileTel: mobileTelRef,
    terms: termsRef,
    captcha: captchaFieldRef,
  };

  function clearFieldError(key: FieldKey) {
    setFieldErrors(prev => (prev[key] ? { ...prev, [key]: false } : prev));
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
      el?.focus({ preventScroll: true });
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
        rentalDays,
        dailyRate,
        vehicleSubtotal,
        extrasSubtotal,
        total,
        deposit,
        balanceDue,
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

  // Live price calculation
  const pricingGroup = modelPricingGroups?.[selectedModel];
  const rentalDays = pickupDate && dropoffDate ? calcRentalDays(pickupDate, dropoffDate, pickupTime, dropoffTime) : 0;
  const pickupMonth = pickupDate ? new Date(pickupDate).getMonth() + 1 : 0;
  const dailyRate = pricingGroup && pickupMonth && rentalDays && rates.length
    ? getDailyRate(rates, pricingGroup as PricingGroup, pickupMonth, rentalDays)
    : 0;
  const vehicleSubtotal = parseFloat((dailyRate * rentalDays).toFixed(2));
  const xRate = (key: string, fallback: number) =>
    extrasConfig.find(e => e.key === key)?.daily_rate ?? fallback;
  const extrasSelections = {
    gps: false,
    baby_seat: Number(babySeat),
    child_seat: Number(childSeat),
    fdw,
    additional_drivers: Number(additionalDrivers),
  };
  const extrasSubtotal = rentalDays ? calcExtrasTotal(extrasConfig, extrasSelections, rentalDays) : 0;
  const extrasLineItems = rentalDays ? buildExtrasLineItems(extrasConfig, extrasSelections, rentalDays) : [];
  const total = parseFloat((vehicleSubtotal + extrasSubtotal).toFixed(2));
  const deposit = parseFloat((total * DEPOSIT_RATE).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));
  const showPrice = !!(pricingGroup && rentalDays > 0 && dailyRate > 0);

  const TermsModal = () => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white">Vehicle Reservation Terms & Conditions</h2>
          <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5 text-sm text-gray-700 dark:text-gray-300">
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Driver's Licence</h3><p>A valid driving licence recognised by the Greek authorities must be held by the driver.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Driver's Age</h3><p>Minimum driver's age is 21 years. A young driver surcharge may apply for drivers aged 21–25.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Credit Card</h3><p>The driver must hold a valid credit card.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Delivery / Collection Fees</h3><p>All deliveries and collections at the Airport, Zakynthos Port and our Office during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Unlimited Mileage</h3><p>Unlimited mileage applies to all rentals.</p></div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Insurance</h3>
            <p>All our rentals include:</p>
            <ul className="list-disc ml-5 mt-1 space-y-1"><li>Third party insurance</li><li>Theft insurance</li><li>Collision Damage Waiver (CDW)</li></ul>
            <p className="mt-2">Additional cover such as Full Damage Waiver (FDW) is available for an additional fee. Bicycles are not covered by the above.</p>
          </div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">7. Cancellation</h3><p>All cancellations received more than 24 hours prior to the start of the rental are free of charge. All other cancellations will be subject to one day's rental charge.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">8. Taxes</h3><p>Our fees include VAT and all local taxes.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">9. Road Assistance</h3><p>We provide free 24-hour roadside assistance.</p></div>
          <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">10. Customer Service</h3><p>Our staff will go above and beyond to ensure you get a hassle-free rental experience. For any additional information please contact us.</p></div>
        </div>
        <div className="p-6 border-t dark:border-gray-700">
          <button onClick={() => setShowTerms(false)} className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition">Close</button>
        </div>
      </div>
    </div>
  );

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
    {showTerms && <TermsModal />}
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-8 shadow-sm">
      <h2 className="text-xl font-semibold mb-6 dark:text-white">Get a Quote</h2>
      <div className="space-y-6">

        {/* Vehicle Model */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle</label>
          <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            {models.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Pick-up Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pick-up Location</label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Drop-off Location</label>
            <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={dropoffLocation} onChange={e => setDropoffLocation(e.target.value)}>
              {locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        )}

        {/* Dates & Times */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rental Dates</label>
          <DateRangePicker
            pickupDate={pickupDate}
            returnDate={dropoffDate}
            onPickupChange={setPickupDate}
            onReturnChange={setDropoffDate}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pick-up Time</label>
            <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={pickupTime} onChange={e => setPickupTime(e.target.value)}>
              {times.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Return Time</label>
            <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={dropoffTime} onChange={e => setDropoffTime(e.target.value)}>
              {times.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Transmission — cars only */}
        {vehicleType === "Cars" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transmission</label>
            <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={transmission} onChange={e => setTransmission(e.target.value)}>
              <option>Any</option>
              <option>Manual</option>
              <option>Automatic</option>
            </select>
          </div>
        )}

        {/* Driver Age */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Driver Age</label>
          <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={driverAge} onChange={e => setDriverAge(e.target.value)}>
            <option>21–25</option>
            <option>26–65</option>
            <option>66+</option>
          </select>
        </div>

        {/* Extras — cars only */}
        {vehicleType === "Cars" && (
          <div className="border-t dark:border-gray-700 pt-6">
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">Extras</h3>
            <div className="border dark:border-gray-600 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3">Description</th>
                    <th className="text-center px-4 py-3">Price per day</th>
                    <th className="text-center px-4 py-3">Selection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(<>
                  <tr>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Baby Seat (0–9 months)</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("baby_seat", 3).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={babySeat} onChange={e => setBabySeat(e.target.value)}>
                        <option>0</option><option>1</option><option>2</option><option>3</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Child Seat (9+ months)</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("child_seat", 3).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={childSeat} onChange={e => setChildSeat(e.target.value)}>
                        <option>0</option><option>1</option><option>2</option><option>3</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Full Damage Waiver (FDW)</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("fdw", 5).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" checked={fdw} onChange={e => setFdw(e.target.checked)} className="rounded" />
                    </td>
                  </tr>
                  </>)}
                  <tr>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Additional Drivers</td>
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

        {/* Live Price Summary */}
        {showPrice && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Price Estimate</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>{selectedModel} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{dailyRate.toFixed(2)}</span>
                <span>€{vehicleSubtotal.toFixed(2)}</span>
              </div>
              {extrasLineItems.map(item => (
                <div key={item.key} className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>{item.label}{item.qty > 1 ? ` ×${item.qty}` : ""} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{item.rate.toFixed(2)}</span>
                  <span>€{item.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-blue-200 dark:border-blue-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
                <span>Total</span>
                <span>€{total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                <span>Deposit (30%) due on confirmation</span>
                <span>€{deposit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                <span>Balance due at pick-up</span>
                <span>€{balanceDue.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">Final price confirmed upon booking. Includes VAT, extras &amp; all taxes.</p>
          </div>
        )}

        {/* Customer Details */}
        <div className="border-t dark:border-gray-700 pt-6">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">Your Details</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={title} onChange={e => setTitle(e.target.value)}>
                  <option>Mr</option><option>Mrs</option><option>Ms</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                <input
                  ref={firstNameRef}
                  type="text"
                  required
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value); clearFieldError("firstName"); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.firstName ? invalidFieldClass : "dark:border-gray-600"}`}
                  placeholder="First name"
                />
                {fieldErrors.firstName && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                <input
                  ref={lastNameRef}
                  type="text"
                  required
                  value={lastName}
                  onChange={e => { setLastName(e.target.value); clearFieldError("lastName"); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.lastName ? invalidFieldClass : "dark:border-gray-600"}`}
                  placeholder="Last name"
                />
                {fieldErrors.lastName && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.lastName}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  ref={emailRef}
                  type="email"
                  required
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearFieldError("email"); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.email ? invalidFieldClass : "dark:border-gray-600"}`}
                  placeholder="your@email.com"
                />
                {fieldErrors.email && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth *</label>
                <div ref={dobFieldRef} className="grid grid-cols-3 gap-2">
                  <select
                    required
                    aria-label="Day of birth"
                    value={dobDay}
                    onChange={e => { setDobDay(e.target.value); clearFieldError("dob"); }}
                    className={`w-full border rounded-lg px-2 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 ${fieldErrors.dob ? invalidFieldClass : "dark:border-gray-600"}`}
                  >
                    <option value="">Day</option>
                    {dobDayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select
                    required
                    aria-label="Month of birth"
                    value={dobMonth}
                    onChange={e => { handleDobMonthChange(e.target.value); clearFieldError("dob"); }}
                    className={`w-full border rounded-lg px-2 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 ${fieldErrors.dob ? invalidFieldClass : "dark:border-gray-600"}`}
                  >
                    <option value="">Month</option>
                    {DOB_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select
                    required
                    aria-label="Year of birth"
                    value={dobYear}
                    onChange={e => { handleDobYearChange(e.target.value); clearFieldError("dob"); }}
                    className={`w-full border rounded-lg px-2 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 ${fieldErrors.dob ? invalidFieldClass : "dark:border-gray-600"}`}
                  >
                    <option value="">Year</option>
                    {dobYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {fieldErrors.dob && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.dob}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Street address" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Postal Code</label>
                <input type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Postal code" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="City" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
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
                <input
                  ref={mobileTelRef}
                  type="tel"
                  required
                  value={mobileTel}
                  onChange={e => { setMobileTel(e.target.value); clearFieldError("mobileTel"); }}
                  className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.mobileTel ? invalidFieldClass : "dark:border-gray-600"}`}
                  placeholder="+30 or international"
                />
                {fieldErrors.mobileTel && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.mobileTel}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Landline</label>
                <input type="tel" value={landlineTel} onChange={e => setLandlineTel(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Optional" />
              </div>
            </div>
            <div className="hidden">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hotel</label>
              <input type="text" className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comments or Special Requests</label>
              <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder="Any special requests?" />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">* Required fields</p>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div>
          <div className={`flex items-start gap-3 ${fieldErrors.terms ? "border border-red-500 rounded-lg p-2 -m-2" : ""}`}>
            <input
              ref={termsRef}
              type="checkbox"
              id="terms"
              required
              checked={terms}
              onChange={e => { setTerms(e.target.checked); clearFieldError("terms"); }}
              className={`mt-1 rounded ${fieldErrors.terms ? "ring-2 ring-red-500" : ""}`}
            />
            <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400">
              I accept the{" "}
              <button type="button" onClick={() => setShowTerms(true)} className="text-orange-600 hover:underline font-medium cursor-pointer">Terms & Conditions</button>
            </label>
          </div>
          {fieldErrors.terms && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.terms}</p>}
        </div>

        {/* reCAPTCHA */}
        <div ref={captchaFieldRef} className={`w-full overflow-hidden ${fieldErrors.captcha ? "border-2 border-red-500 rounded-lg p-2" : ""}`}>
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey="6Lc_mjwtAAAAAKDT-iW8Lu9rql51ldO87Y9NQCvL"
            onChange={(token: string | null) => { setCaptchaToken(token); if (token) clearFieldError("captcha"); }}
            onExpired={() => setCaptchaToken(null)}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            This site is protected by reCAPTCHA and the Google{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Privacy Policy</a>{" "}
            and{" "}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Terms of Service</a>{" "}
            apply.
          </p>
          {fieldErrors.captcha && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{FIELD_MESSAGES.captcha}</p>}
        </div>

        {status === "error" && (
          <p className="text-red-500 text-sm">Something went wrong. Please try again or contact us directly.</p>
        )}

        <button type="submit" disabled={status === "sending"} className="w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition disabled:opacity-50">
          {status === "sending" ? "Sending..." : "Get Quote"}
        </button>

      </div>
    </form>
    </>
  );
}