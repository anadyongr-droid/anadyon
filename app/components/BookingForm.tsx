"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { DRIVER_AGE_POLICY, DRIVER_AGE_POLICY_EL, DRIVER_AGE_BANDS, MAX_CHILD_SEATS_TOTAL, driverAgeBandForDob, ageOnDate } from "@/lib/rentalPolicy";
import { termsCopy } from "@/lib/i18n/content/legal";
import LegalSections from "./LegalSections";
import ReCAPTCHA from "react-google-recaptcha";
import { recaptchaSiteKey } from "@/lib/recaptchaKeys";
import { calcPromoDiscount, calcRentalDays, calcVehicleSegments, calcVehicleSubtotal, calcInsuranceSurchargeLine, DEPOSIT_RATE } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup, PromoType, RateSegment } from "@/lib/pricing";
import DateRangePicker from "./DateRangePicker";
import DobWheelPicker from "./DobWheelPicker";
import { TIME_OPTIONS } from "@/lib/bookingFields";
import { BOOKING_LOCATIONS, DEFAULT_PUBLIC_BOOKING_LOCATION } from "@/lib/bookingLocations";
import { translator, localePath, type Locale } from "@/lib/i18n";
import { useModalBehavior } from "@/app/hooks/useModalBehavior";

/**
 * Pick-up and drop-off points.
 *
 * `value` is what gets stored and emailed, so it stays in one language whatever
 * the visitor is reading — the office should not have to work out that
 * "Αεροδρόμιο Ζακύνθου" and "Zakynthos Airport" are the same place. `key` is
 * what the visitor sees.
 */
const locations = BOOKING_LOCATIONS.map(({ value, translationKey: key }) => ({ value, key }));

// Shared with the admin reservation form so staff and customers can never end
// up choosing from different sets of times.
const times = TIME_OPTIONS;

/**
 * Country list as ISO codes, with both the stored value and the visible label
 * derived from Intl at render.
 *
 * The previous hand-written list of 95 English names would have needed a second
 * hand-written list of 95 Greek ones, kept in step by hand forever. This way the
 * Greek page shows "Ελλάδα" and the record still stores "Greece", so the office
 * reads one vocabulary whatever language the customer booked in.
 */
const COUNTRY_CODES = ["AD","AE","AF","AL","AM","AO","AR","AT","AU","AZ","BA","BD","BE","BG","BH","BO","BR","BY","CA","CH","CL","CN","CO","CY","CZ","DE","DK","DZ","EC","EE","EG","ES","FI","GB","GE","GH","GR","HR","HU","ID","IE","IL","IN","IQ","IR","IS","IT","JO","JP","KE","KH","KR","KW","KZ","LB","LT","LU","LV","MA","MD","ME","MK","MT","MX","MY","NG","NL","NO","NZ","OM","PE","PH","PK","PL","PS","PT","QA","RO","SA","SE","SG","SI","SK","TH","TN","TR","UA","US","VE","VN","ZA"];

function countryOptions(locale: Locale) {
  const stored = new Intl.DisplayNames(["en"], { type: "region" });
  const shown = new Intl.DisplayNames([locale === "el" ? "el" : "en"], { type: "region" });
  return COUNTRY_CODES
    .map((code) => ({ value: stored.of(code) ?? code, label: shown.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, locale === "el" ? "el" : "en"));
}

function localDateStr(d = new Date()) {
  return d.toLocaleDateString("sv");
}
const today = localDateStr();
const tomorrow = localDateStr(new Date(Date.now() + 86400000));
const currentYear = new Date().getFullYear();

function preferredDobYear(ageBand: string) {
  const representativeAge = ageBand === "21–25" ? 23 : ageBand === "66+" ? 70 : 45;
  return currentYear - representativeAge;
}

/** Stored value stays English; the label follows the page language. */
const TITLES = [
  { value: "Mr",  key: "title.mr" },
  { value: "Mrs", key: "title.mrs" },
  { value: "Ms",  key: "title.ms" },
];

type FieldKey = "firstName" | "lastName" | "email" | "dob" | "mobileTel" | "terms" | "captcha";
const invalidFieldClass = "border-red-500 dark:border-red-500 ring-1 ring-red-500";

type Props = {
  vehicleType: string;
  models: string[];
  initialModel?: string;
  modelPricingGroups?: Record<string, string>;
  locale?: Locale;
  modelTransmissions?: Record<string, string>;
  /**
   * The rate card, read on the server by the page rendering this form.
   *
   * Present in the normal case; absent when the server read failed, in which
   * case the client fetch below takes over — which is what always ran before.
   */
  initialRates?: Rate[];
  initialExtras?: ExtrasConfig[];
};

// Defined at module scope: declaring a component inside the render body makes
// React remount the whole modal subtree on every parent render.
function TermsModal({ onClose, locale = "en" }: { onClose: () => void; locale?: Locale }) {
  const dialogRef = useModalBehavior<HTMLDivElement>(onClose);
  const tr = translator(locale);
  const copy = termsCopy(locale);
  const agePolicy = locale === "el" ? DRIVER_AGE_POLICY_EL : DRIVER_AGE_POLICY;
  const termsSections = copy.sections.map((sec) => ({
    ...sec,
    paragraphs: sec.paragraphs?.map((para) => (para === "__AGE_POLICY__" ? agePolicy : para)),
  }));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rental-terms-title"
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 id="rental-terms-title" className="text-lg font-semibold dark:text-white">{copy.title}</h2>
          <button type="button" aria-label={tr("form.close")} onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>
        {/*
          Rendered from lib/i18n/content/legal.ts — the same source the /terms
          page uses. This modal previously carried its own English copy of all
          ten clauses, so the terms a customer accepted at the point of booking
          could drift from the terms published on the site, and only one of the
          two was ever translated.
        */}
        <div className="overflow-y-auto overscroll-contain p-6 space-y-5 text-sm text-gray-700 dark:text-gray-300">
          <LegalSections sections={termsSections} locale={locale} />
        </div>
        <div className="p-6 border-t dark:border-gray-700">
          <button onClick={onClose} className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition">{tr("form.close")}</button>
        </div>
      </div>
    </div>
  );
}

export default function BookingForm({ vehicleType, models, initialModel, modelPricingGroups, modelTransmissions, locale = "en", initialRates, initialExtras }: Props) {
  const tr = translator(locale);
  const formRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  // What the server actually said, so the customer is told the real reason.
  const [submitError, setSubmitError] = useState<string>("");
  // Guards against a double-click creating two quotes; see handleSubmit.
  const submittingRef = useRef(false);

  const [selectedModel, setSelectedModel] = useState(initialModel ?? models[0]);
  const [rates, setRates] = useState<Rate[]>(initialRates ?? []);
  const [extrasConfig, setExtrasConfig] = useState<ExtrasConfig[]>(initialExtras ?? []);

  // The vehicle cards remain available above an open booking form. When a
  // customer chooses another card, the parent supplies its model here; keep
  // the form's own selection in step so its price and submitted model change
  // together, while retaining the dates and other work already entered.
  useEffect(() => {
    if (initialModel) setSelectedModel(initialModel);
  }, [initialModel]);

  // Until this returns there is no price to show, so the panel is absent rather
  // than empty. A silent failure left it absent forever — a booking form with no
  // prices and nothing saying why — so the outcome is tracked explicitly.
  // "ready" when the server already supplied the card, so the price panel is
  // on screen at first paint rather than after a round trip. The form pre-fills
  // today and tomorrow, so rentalDays is 1 the moment it opens and the skeleton
  // used to show every single time — 110ms on a warm CDN, 560-660ms on a cold
  // one, on the click that matters most.
  const [ratesState, setRatesState] = useState<"loading" | "ready" | "failed">(
    initialRates?.length ? "ready" : "loading"
  );

  // Reloading the card is offered to the customer as well as attempted once on
  // mount: the server retries a transient Supabase rejection three times, but if
  // all three land inside the same blip the customer should not have to guess
  // that reloading the whole page is the remedy.
  const loadRates = useCallback(async () => {
    setRatesState("loading");
    try {
      const res = await fetch("/api/admin/rates", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { rates: r, extras: e } = await res.json();
      if (!Array.isArray(r) || r.length === 0) throw new Error("no rates returned");
      setRates(r);
      setExtrasConfig(e ?? []);
      setRatesState("ready");
    } catch (err) {
      console.error("Rate card could not be loaded:", err);
      setRatesState("failed");
    }
  }, []);

  useEffect(() => {
    if (!modelPricingGroups) return;
    // Skipped when the server already supplied the card. loadRates begins with
    // setRatesState("loading"), so running it here would put the skeleton back
    // on screen for the length of a request we do not need — undoing the whole
    // point of seeding the state. The page revalidates every five minutes and
    // an admin price change revalidates it immediately, so a per-open refetch
    // buys nothing.
    if (initialRates?.length) return;
    loadRates();
  }, [loadRates, initialRates]);

  const [differentDropoff, setDifferentDropoff] = useState(false);
  const [pickupDate, setPickupDate] = useState(today);
  const [dropoffDate, setDropoffDate] = useState(tomorrow);
  // The English value is what is stored and emailed; the label is translated
  // at render, so switching language never changes what the office receives.
  const [pickupLocation, setPickupLocation] = useState(DEFAULT_PUBLIC_BOOKING_LOCATION);
  const [dropoffLocation, setDropoffLocation] = useState(DEFAULT_PUBLIC_BOOKING_LOCATION);
  const [pickupTime, setPickupTime] = useState("09:00");
  const [dropoffTime, setDropoffTime] = useState("09:00");
  // The vehicle pages hand this over as a dictionary key so the label can be
  // translated. What gets STORED has to be the canonical English word, because
  // that is what vehicles.transmission holds and what checkSubstitution
  // compares against — a quote saying "spec.manual" never matches a car saying
  // "Manual", so the guard that stops a manual customer being given an
  // automatic would refuse every assignment instead.
  const transmissionKey = modelTransmissions?.[selectedModel] ?? null;
  const transmission = transmissionKey
    ? (transmissionKey === "spec.automatic" ? "Automatic"
       : transmissionKey === "spec.manual" ? "Manual"
       : transmissionKey)
    : null;
  const [driverAge, setDriverAge] = useState<string>(DRIVER_AGE_BANDS[1]);
  const [babySeat, setBabySeat] = useState("0");
  const [childSeat, setChildSeat] = useState("0");
  const [fdw, setFdw] = useState(false);
  const [additionalDrivers, setAdditionalDrivers] = useState("0");

  // Stored in English so the office reads one vocabulary, shown translated.
  const [title, setTitle] = useState("Mr");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
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

  // Promo code. The applied code's *formula* is kept — its type and value —
  // never a settled amount. A percentage code applied before the customer
  // changes dates, model or extras used to keep the figure it was worth at the
  // moment it was entered, so the deduction shown went stale in both
  // directions. The discount is derived below on every render instead.
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<{
    valid: boolean;
    code?: string;
    id?: string;
    discount_type?: PromoType;
    value?: number;
    description?: string;
    error?: string;
  } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  // DOB is authoritative. Re-evaluate against the rental start date too,
  // because the customer can go back and move the booking across a birthday.
  const impliedDriverAge = driverAgeBandForDob(dob, pickupDate);
  const effectiveDriverAge = impliedDriverAge ?? driverAge;

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
  // The insurance surcharge, shown here for the same reason the server charges
  // it: so the two agree. The server recomputes every price independently and
  // emails the office a manipulation warning when the customer's total differs
  // from its own — so a surcharge added on one side only would raise a fraud
  // alarm on every single under-23 booking. Same rule, same rate row, both ends.
  const ageAtPickup = dob && pickupDate ? ageOnDate(dob, pickupDate) : null;
  const insuranceSurcharge = rentalDays
    ? calcInsuranceSurchargeLine(extrasConfig, ageAtPickup, rentalDays)
    : null;
  const extrasSubtotal = rentalDays
    ? parseFloat((
        (fdw ? xRate("fdw", 5) : 0) * rentalDays +
        Number(babySeat) * xRate("baby_seat", 3) * rentalDays +
        Number(childSeat) * xRate("child_seat", 3) * rentalDays +
        Number(additionalDrivers) * xRate("additional_drivers", 2.5) * rentalDays +
        (insuranceSurcharge?.total ?? 0)
      ).toFixed(2))
    : 0;
  // Baby and child seats share one back seat, so each dropdown offers only what
  // is left after the other. The already-selected value stays in its own list
  // even if the pair is over the limit, so a stale selection can still be seen
  // and corrected rather than silently snapping to a number nobody chose.
  const seatOptions = (own: number, other: number) =>
    Array.from({ length: MAX_CHILD_SEATS_TOTAL + 1 }, (_, n) => n)
      .filter(n => n + other <= MAX_CHILD_SEATS_TOTAL || n === own);
  const babySeatOptions = seatOptions(Number(babySeat) || 0, Number(childSeat) || 0);
  const childSeatOptions = seatOptions(Number(childSeat) || 0, Number(babySeat) || 0);

  const subtotalBeforePromo = parseFloat((vehicleSubtotal + extrasSubtotal).toFixed(2));
  // Recomputed from the formula against the current subtotal, so changing the
  // model, dates, times, FDW, seats or additional drivers moves the deduction
  // with them. A fixed code is capped at the subtotal, matching the database.
  const promoDiscount = promoResult?.valid
    ? calcPromoDiscount(
        { type: promoResult.discount_type ?? "percentage", value: Number(promoResult.value) },
        subtotalBeforePromo,
      )
    : 0;
  const total = parseFloat(Math.max(0, subtotalBeforePromo - promoDiscount).toFixed(2));
  const deposit = parseFloat((total * DEPOSIT_RATE).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    // No total is sent. The endpoint returns the code's formula; letting the
    // client name the base of a percentage is what made the deduction the
    // client's to choose.
    const res = await fetch("/api/promo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promoInput }),
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

    // The button is disabled while sending, but that is React state and does
    // not take effect until the next render — two clicks inside the same frame
    // both get through and create two quotes. A ref changes synchronously.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStatus("sending");
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captchaToken,
        locale,
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
        driverAge: effectiveDriverAge,
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
        // The code only. Its id and the amount it is worth are the server's to
        // resolve — sending either invited them to be trusted.
        promoCode: promoResult?.valid ? promoResult.code : undefined,
        extrasLines: [
          ...(fdw ? [{ label: `${tr("extra.fdw")} — ${rentalDays} ${tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €${xRate("fdw", 5).toFixed(2)}`, amount: (xRate("fdw", 5) * rentalDays).toFixed(2) }] : []),
          ...(Number(babySeat) > 0 ? [{ label: `${tr("extra.babySeat")} ×${babySeat} — ${rentalDays} ${tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €${xRate("baby_seat", 3).toFixed(2)}`, amount: (xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2) }] : []),
          ...(Number(childSeat) > 0 ? [{ label: `${tr("extra.childSeat")} ×${childSeat} — ${rentalDays} ${tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €${xRate("child_seat", 3).toFixed(2)}`, amount: (xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2) }] : []),
          ...(Number(additionalDrivers) > 0 ? [{ label: `${tr("extra.additionalDrivers")} ×${additionalDrivers} — ${rentalDays} ${tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €${xRate("additional_drivers", 2.5).toFixed(2)}`, amount: (xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2) }] : []),
          ...(insuranceSurcharge ? [{ label: `${tr("extra.insuranceSurcharge")} — ${rentalDays} ${tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €${insuranceSurcharge.dailyRate.toFixed(2)}`, amount: insuranceSurcharge.total.toFixed(2) }] : []),
        ],
        title,
        firstName,
        lastName,
        email,
        dob,
        flightNumber,
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
      // Deliberately not released: the form is replaced by the acknowledgment, and
      // a resubmission after success would be a second quote for one enquiry.
    } else {
      // The route already answers with something specific and usable — the
      // captcha was rejected, the email is malformed, the rate card could not be
      // read, too many attempts. All of it used to be replaced with "Something
      // went wrong", which tells the customer nothing and tells us nothing when
      // they report it.
      const detail = await res.json().catch(() => null);
      setSubmitError(
        res.status === 429
          ? tr("form.tooManyAttempts")
          : ((detail?.error as string | undefined) ?? tr("form.submitError"))
      );
      setStatus("error");
      submittingRef.current = false;

      // A reCAPTCHA token is single-use and has now been spent, whether the
      // server accepted it or not. Without this reset the second attempt sends
      // the same consumed token, Google refuses it, and every retry fails
      // identically no matter what was actually wrong the first time — the only
      // escape being to reload the page and fill the form again.
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
    }
  }

  if (status === "sent") {
    return (
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-8 shadow-sm text-center space-y-3">
        <h2 className="text-xl font-semibold text-green-600">{tr("form.requestSent")}</h2>
        {quoteRef && (
          <p className="text-gray-700 dark:text-gray-300">
            {tr("form.yourReferenceIs")}{" "}
            <span className="font-mono font-bold text-gray-900 dark:text-white">{quoteRef}</span>
          </p>
        )}
        <p className="text-gray-600 dark:text-gray-400">{tr("form.willContactYou")}</p>
        {quoteRef && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tr("form.viewAnyTime")}{" "}
            {/* localePath, so a Greek booking links to the Greek quote page
                rather than dropping the reader into the English one. */}
            <a href={localePath(`/quote/${quoteRef}`, locale)} className="text-blue-700 dark:text-blue-400 underline font-medium">
              {localePath(`/quote/${quoteRef}`, locale)}
            </a>
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
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step === 1 ? "bg-orange-700 text-white" : "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400"}`}>1</span>
            <span className={`text-sm font-medium ${step === 1 ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>{tr("form.stepRental")}</span>
          </div>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step === 2 ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>2</span>
            <span className={`text-sm font-medium ${step === 2 ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>{tr("form.stepDetails")}</span>
          </div>
        </div>

        {/* ── STEP 1: Rental details ── */}
        {step === 1 && (
          <div className="p-4 sm:p-8 space-y-6">
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
                {locations.map(l => <option key={l.value} value={l.value}>{tr(l.key)}</option>)}
              </select>
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
                <input type="checkbox" checked={differentDropoff} onChange={() => setDifferentDropoff(!differentDropoff)} className="rounded" />
                {tr("form.differentLocation")}
              </label>
            </div>

            {/* Drop-off Location */}
            {differentDropoff && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.dropoffLocation")}</label>
                <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={dropoffLocation} onChange={e => setDropoffLocation(e.target.value)}>
                  {locations.map(l => <option key={l.value} value={l.value}>{tr(l.key)}</option>)}
                </select>
              </div>
            )}

            {/* Dates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr("form.rentalDates")}</label>
              <DateRangePicker
                locale={locale}
                pickupDate={pickupDate}
                returnDate={dropoffDate}
                onPickupChange={setPickupDate}
                onReturnChange={setDropoffDate}
                pickupTime={pickupTime}
                returnTime={dropoffTime}
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
              <label htmlFor="public-driver-age" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.driverAge")}</label>
              <select id="public-driver-age" aria-describedby={impliedDriverAge ? "public-driver-age-help" : undefined} disabled={!!impliedDriverAge} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800" value={effectiveDriverAge} onChange={e => setDriverAge(e.target.value)}>
                <option>21–25</option>
                <option>26–65</option>
                <option>66+</option>
              </select>
              {impliedDriverAge && <p id="public-driver-age-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tr("form.driverAgeFromDob")}</p>}
            </div>

            {/* Extras — cars only */}
            {vehicleType === "Cars" && (
              <div className="border-t dark:border-gray-700 pt-6">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">{tr("form.extras")}</h3>
                {/*
                  overflow-x-auto, not overflow-hidden. Three columns of
                  extras do not fit a 320px phone once the form's padding is
                  taken off — the table's own minimum content width runs about
                  8px past the edge. Hidden clipped the last column away
                  silently; auto lets that one table scroll inside its own box
                  while the page does not move.

                  Caught by the browser suite on CI and not locally: Linux
                  renders this text slightly wider than macOS, and 8px was the
                  whole margin. Worth remembering that "passes on my machine"
                  and "fits" are different claims about a layout.
                */}
                <div className="border dark:border-gray-600 rounded-lg overflow-x-auto">
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
                            {babySeatOptions.map(n => <option key={n}>{n}</option>)}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tr("extra.childSeat")}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">€ {xRate("child_seat", 3).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <select className="border dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={childSeat} onChange={e => setChildSeat(e.target.value)}>
                            {childSeatOptions.map(n => <option key={n}>{n}</option>)}
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

            {/*
              Price Estimate.

              The panel cannot appear until the rate card has been fetched, so
              without these two states it simply materialised late — or, when the
              fetch failed, never, leaving a booking form with no prices and
              nothing explaining why. A placeholder holds the space while it
              loads; a failure says so and points at the phone.
            */}
            {ratesState === "loading" && rentalDays > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <div className="h-4 w-32 rounded bg-blue-200/70 dark:bg-blue-800/70 mb-3 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-blue-200/50 dark:bg-blue-800/50 animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-blue-200/50 dark:bg-blue-800/50 animate-pulse" />
                </div>
              </div>
            )}

            {ratesState === "failed" && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 rounded-xl p-5 text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                  {tr("form.priceUnavailable")}
                </p>
                <p className="text-amber-800 dark:text-amber-300">
                  {tr("form.priceUnavailableHelp")}
                </p>
                <button
                  type="button"
                  onClick={loadRates}
                  className="mt-3 rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                >
                  {tr("form.tryAgain")}
                </button>
              </div>
            )}

            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">{tr("form.priceEstimate")}</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{selectedModel} — {rentalDays} {tr(rentalDays === 1 ? "form.dayRental" : "form.daysRental")} × €{rentalDays > 0 ? (vehicleSubtotal / rentalDays).toFixed(2) : "0.00"}</span>
                    <span>€{vehicleSubtotal.toFixed(2)}</span>
                  </div>
                  {fdw && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.fdw")} — {rentalDays} {tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €{xRate("fdw", 5).toFixed(2)}</span>
                      <span>€{(xRate("fdw", 5) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(babySeat) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.babySeat")} ×{babySeat} — {rentalDays} {tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €{xRate("baby_seat", 3).toFixed(2)}</span>
                      <span>€{(xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(childSeat) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.childSeat")} ×{childSeat} — {rentalDays} {tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €{xRate("child_seat", 3).toFixed(2)}</span>
                      <span>€{(xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(additionalDrivers) > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.additionalDrivers")} ×{additionalDrivers} — {rentalDays} {tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €{xRate("additional_drivers", 2.5).toFixed(2)}</span>
                      <span>€{(xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2)}</span>
                    </div>
                  )}
                  {insuranceSurcharge && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400" data-testid="insurance-surcharge-line">
                      <span>{tr("extra.insuranceSurcharge")} — {rentalDays} {tr(rentalDays === 1 ? "quote.day" : "quote.days")} × €{insuranceSurcharge.dailyRate.toFixed(2)}</span>
                      <span>€{insuranceSurcharge.total.toFixed(2)}</span>
                    </div>
                  )}
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>{tr("form.promoCode")} ({promoResult?.code})</span>
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
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">{tr("form.finalPriceNote")}</p>

                {/* Promo code */}
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                  {promoResult?.valid ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600 dark:text-green-400 font-medium">✓ {tr("form.codeApplied").replace("{code}", promoResult.code ?? "")}</span>
                      <button onClick={() => { setPromoResult(null); setPromoInput(""); }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline">{tr("form.remove")}</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {/*
                      Stacked on small screens, side by side from `sm` up.

                      As a single row it overflowed: a flex item defaults to
                      `min-width: auto`, and for an input that floor is its
                      intrinsic size — roughly twenty characters — so `flex-1`
                      could not shrink it and the Apply button was pushed past
                      the edge. Measured on production in Greek at a 366px
                      viewport: the input rendered 196px wide inside a 180px
                      row, putting the button's right edge exactly on the
                      viewport boundary. Narrower phones, larger system text or
                      the longer Greek label push it off screen entirely, which
                      is why it looked fine one day and broken the next.

                      `min-w-0` removes that floor, `shrink-0` stops the button
                      being squeezed, and stacking means neither has to fight
                      for room on a small phone in the first place.
                      */}
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoResult(null); }}
                        onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                        placeholder={tr("form.promoCode")}
                        className="w-full min-w-0 sm:flex-1 border border-blue-200 dark:border-blue-700 rounded-lg px-3 min-h-11 sm:min-h-0 sm:py-1.5 text-sm bg-white dark:bg-blue-900 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                      <button onClick={applyPromo} disabled={promoChecking || !promoInput.trim()}
                        className="w-full shrink-0 sm:w-auto px-3 min-h-11 sm:min-h-0 sm:py-1.5 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-50 transition">
                        {promoChecking ? "…" : tr("form.apply")}
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
              className="w-full bg-orange-700 text-white font-semibold py-3 rounded-lg hover:bg-orange-800 transition"
            >
              {tr("form.continue")}
            </button>
          </div>
        )}

        {/* ── STEP 2: Your details ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6">
            <h2 className="text-xl font-semibold dark:text-white">{tr("form.stepDetails")}</h2>

            {/* Booking summary */}
            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 max-w-sm">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <p className="font-semibold text-blue-900 dark:text-blue-100">
                    {selectedModel}
                    <span className="ml-2 inline-block bg-orange-700 text-white text-xs font-semibold rounded-full px-2 py-0.5 align-middle">{rentalDays} {tr(rentalDays === 1 ? "form.dayRental" : "form.daysRental")}</span>
                  </p>
                  <p className="text-xl font-bold text-blue-900 dark:text-blue-100 flex-shrink-0">€{total.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-blue-200 dark:bg-blue-700 rounded-lg overflow-hidden mb-2">
                  <div className="bg-blue-50 dark:bg-blue-950 pr-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">{tr("form.pickup")}</p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-0.5">
                      {new Date(pickupDate + "T00:00:00").toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 pl-3 py-2 text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">{tr("form.return")}</p>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-0.5">
                      {new Date(dropoffDate + "T00:00:00").toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                {transmissionKey && (
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">{tr("form.transmission")}: <span className="font-semibold text-blue-700 dark:text-blue-300">{transmissionKey ? tr(transmissionKey) : ""}</span></p>
                )}
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">{tr("form.depositLine").replace("{amount}", deposit.toFixed(2))}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.title")}</label>
                  <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={title} onChange={e => setTitle(e.target.value)}>
                    {TITLES.map(t => <option key={t.value} value={t.value}>{tr(t.key)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.firstName")} *</label>
                  <input ref={firstNameRef} type="text" value={firstName} onChange={e => { setFirstName(e.target.value); clearFieldError("firstName"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.firstName ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder={tr("form.firstNamePh")} />
                  {fieldErrors.firstName && <p className="text-red-500 text-xs mt-1">{tr("err.firstName")}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.lastName")} *</label>
                  <input ref={lastNameRef} type="text" value={lastName} onChange={e => { setLastName(e.target.value); clearFieldError("lastName"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.lastName ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder={tr("form.lastNamePh")} />
                  {fieldErrors.lastName && <p className="text-red-500 text-xs mt-1">{tr("err.lastName")}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.email")} *</label>
                <input ref={emailRef} type="email" value={email} onChange={e => { setEmail(e.target.value); clearFieldError("email"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.email ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder={tr("form.emailPh")} />
                {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{tr("err.email")}</p>}
              </div>
              <div ref={dobFieldRef} className="grid grid-cols-2 gap-x-3" data-testid="dob-flight-row">
                <label htmlFor="public-dob" className="mb-1 block min-w-0 text-sm font-medium text-gray-700 dark:text-gray-300">{tr("form.dob")} *</label>
                <label htmlFor="public-flight-number" className="mb-1 block min-w-0 text-sm font-medium text-gray-700 dark:text-gray-300">{tr("form.flightNumber")}</label>
                <div className="min-w-0">
                  <DobWheelPicker
                    id="public-dob"
                    value={dob}
                    onChange={(next) => { setDob(next); clearFieldError("dob"); }}
                    minYear={currentYear - 110}
                    maxYear={currentYear - 18}
                    preferredYear={preferredDobYear(effectiveDriverAge)}
                    locale={locale}
                    invalid={!!fieldErrors.dob}
                    errorId="public-dob-error"
                    labels={{
                      title: tr("form.dob"),
                      day: tr("form.day"),
                      month: tr("form.month"),
                      year: tr("form.year"),
                      cancel: tr("form.cancel"),
                      done: tr("form.done"),
                      help: tr("form.dobWheelHelp"),
                      placeholder: tr("form.dobPlaceholder"),
                    }}
                  />
                  {fieldErrors.dob && <p id="public-dob-error" className="text-red-500 text-xs mt-1">{tr("err.dob")}</p>}
                </div>
                <div className="min-w-0">
                  <input
                    id="public-flight-number"
                    type="text"
                    value={flightNumber}
                    onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
                    maxLength={40}
                    autoComplete="off"
                    className="box-border h-11 w-full min-w-0 appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    placeholder={tr("form.flightNumberPh")}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tr("form.flightNumberHelp")}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.address")}</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder={tr("form.streetAddress")} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.postalCode")}</label>
                  <input type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder={tr("form.postalCodePh")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.city")}</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder={tr("form.city")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.country")}</label>
                  <select className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" value={country} onChange={e => setCountry(e.target.value)}>
                    {/* Greece first — it is where most drivers licences come from. */}
                    <option value="Greece">{tr("form.greece")}</option>
                    <optgroup label="─────────────">
                      {countryOptions(locale)
                        .filter(c => c.value !== "Greece")
                        .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.mobile")} *</label>
                  <input ref={mobileTelRef} type="tel" value={mobileTel} onChange={e => { setMobileTel(e.target.value); clearFieldError("mobileTel"); }} className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${fieldErrors.mobileTel ? invalidFieldClass : "border-gray-300 dark:border-gray-600"}`} placeholder={tr("form.mobilePh")} />
                  {fieldErrors.mobileTel && <p className="text-red-500 text-xs mt-1">{tr("err.mobile")}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.landline")}</label>
                  <input type="tel" value={landlineTel} onChange={e => setLandlineTel(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder={tr("form.optional")} />
                </div>
              </div>
              <div className="hidden">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.hotel")}</label>
                <input type="text" className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.comments")}</label>
                <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" placeholder={tr("form.commentsPh")} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{tr("form.requiredFields")}</p>
              </div>
            </div>

            {/* Terms */}
            <div ref={termsRef} className="flex items-start gap-3">
              <input type="checkbox" id="terms" checked={terms} onChange={e => { setTerms(e.target.checked); clearFieldError("terms"); }} className={`mt-1 rounded ${fieldErrors.terms ? "ring-2 ring-red-500" : ""}`} />
              <div>
                <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400">
                  {tr("form.acceptTerms")}{" "}
                  <button type="button" onClick={() => setShowTerms(true)} className="text-orange-700 hover:underline font-medium cursor-pointer">{tr("form.termsLink")}</button>
                </label>
                {fieldErrors.terms && <p className="text-red-500 text-xs mt-1">{tr("err.terms")}</p>}
              </div>
            </div>

            {/* reCAPTCHA */}
            <div ref={captchaFieldRef} className="w-full overflow-hidden">
              <div className="origin-top-left scale-[0.82] min-[360px]:scale-[0.95] min-[375px]:scale-100">
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={recaptchaSiteKey()}
                  onChange={(token: string | null) => { setCaptchaToken(token); clearFieldError("captcha"); }}
                  onExpired={() => setCaptchaToken(null)}
                />
              </div>
              {fieldErrors.captcha && <p className="text-red-500 text-xs mt-1">{tr("err.recaptcha")}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {tr("form.recaptchaNotice")}{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">{tr("form.privacyPolicy")}</a>{" "}
                {tr("form.and")}{" "}
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">{tr("form.termsOfService")}</a>{" "}
                {tr("form.recaptchaApply")}
              </p>
            </div>

            {status === "error" && (
              <p className="text-red-500 text-sm">{submitError || tr("form.submitError")}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {tr("form.back")}
              </button>
              <button
                type="submit"
                disabled={status === "sending"}
                className="flex-2 w-full bg-orange-700 text-white font-semibold py-3 rounded-lg hover:bg-orange-800 transition disabled:opacity-50"
              >
                {status === "sending" ? tr("form.sending") : tr("form.getQuote")}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
