"use client";
import { useState, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { Phone, Mail, Clock, MapPin } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";

export default function ContactClient({ locale = "en" }: { locale?: Locale }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const tr = (key: string) => t(locale, key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    // Validation messages are translated too — an English error under a Greek
    // label is exactly where a half-translated form gives itself away.
    if (!name.trim()) { setFormError(tr("contact.errName")); return; }
    if (!email.trim()) { setFormError(tr("contact.errEmail")); return; }
    if (!message.trim()) { setFormError(tr("contact.errMessage")); return; }
    if (!captchaToken) { setFormError(tr("contact.errCaptcha")); return; }
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message, captchaToken }),
    });
    setStatus(res.ok ? "sent" : "error");

    if (!res.ok) {
      // The token is single-use and has been spent. Without this, a second
      // attempt sends the same consumed token and fails identically however
      // many times it is pressed.
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
    }
  }

  // The reCAPTCHA notice carries two links Google requires be shown; the copy
  // around them differs by language, so the sentence is assembled from the
  // translated string rather than hard-coded in JSX.
  const notice = tr("contact.recaptchaNotice").split(/(\{privacy\}|\{terms\})/g).map((part, i) => {
    if (part === "{privacy}") {
      return <a key={i} href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">{tr("contact.recaptchaPrivacy")}</a>;
    }
    if (part === "{terms}") {
      return <a key={i} href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">{tr("contact.recaptchaTerms")}</a>;
    }
    return part;
  });

  const inputCls = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{tr("contact.title")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-10">{tr("contact.intro")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* Contact details */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-5">{tr("contact.details")}</h2>
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{tr("contact.address")}</p>
                    <p>{tr("contact.addressValue")}<br />{tr("contact.addressValue2")}</p>
                  </div>
                </div>
                {/*
                  The two numbers are stacked and directly adjacent, so at the
                  natural 20px line height a thumb aiming for the mobile lands
                  on the landline. min-h-11 gives each the 44px the footer links
                  already use; -my-1 absorbs the extra height so the block keeps
                  its spacing. Inline links inside prose are left alone — WCAG
                  2.5.8 exempts them, and padding them out breaks the line.
                */}
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{tr("contact.phone")}</p>
                    <a href="tel:+302695041878" className="hover:text-blue-700 dark:hover:text-blue-400 flex items-center min-h-11 -my-1">+30 26950 41878</a>
                    <a href="tel:+306988010188" className="hover:text-blue-700 dark:hover:text-blue-400 flex items-center min-h-11 -my-1">+30 6988 010188</a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{tr("contact.email")}</p>
                    <a href="mailto:customerservice@anadyon.gr" className="hover:text-blue-700 dark:hover:text-blue-400 inline-flex items-center min-h-11 -my-1">customerservice@anadyon.gr</a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{tr("contact.hours")}</p>
                    <p>{tr("contact.hoursValue")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Message form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            {status === "sent" ? (
              <div className="text-center py-8">
                <h2 className="text-xl font-semibold text-green-600 mb-2">{tr("contact.sentTitle")}</h2>
                <p className="text-gray-500 dark:text-gray-400">{tr("contact.sentBody")}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{tr("contact.formTitle")}</h2>
                <div>
                  <label className={labelCls} htmlFor="contact-name">{tr("contact.name")} *</label>
                  <input id="contact-name" type="text" required value={name} onChange={e => setName(e.target.value)}
                    className={inputCls} placeholder={tr("contact.namePlaceholder")} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="contact-email">{tr("contact.emailLabel")} *</label>
                  <input id="contact-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className={inputCls} placeholder={tr("contact.emailPlaceholder")} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="contact-message">{tr("contact.message")} *</label>
                  <textarea id="contact-message" required rows={5} value={message} onChange={e => setMessage(e.target.value)}
                    className={inputCls} placeholder={tr("contact.messagePlaceholder")} />
                </div>
                <div className="w-full overflow-hidden flex flex-col justify-start gap-1">
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey="6Lc_mjwtAAAAAKDT-iW8Lu9rql51ldO87Y9NQCvL"
                    hl={locale}
                    onChange={(token: string | null) => setCaptchaToken(token)}
                    onExpired={() => setCaptchaToken(null)}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500">{notice}</p>
                </div>
                {formError && (
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{formError}</p>
                )}
                {status === "error" && (
                  <p className="text-red-500 text-sm">{tr("contact.errSend")}</p>
                )}
                <button type="submit" disabled={status === "sending"}
                  className="w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition disabled:opacity-50">
                  {status === "sending" ? tr("contact.sending") : tr("contact.send")}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
