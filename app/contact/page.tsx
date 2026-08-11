"use client";
import { useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { Phone, Mail, Clock, MapPin } from "lucide-react";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Name is required."); return; }
    if (!email.trim()) { setFormError("Email address is required."); return; }
    if (!message.trim()) { setFormError("Message is required."); return; }
    if (!captchaToken) { setFormError("Please complete the reCAPTCHA verification."); return; }
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message, captchaToken }),
    });
    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Contact Us</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-10">We'd love to hear from you. Send us a message and we'll get back to you as soon as possible.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* Contact Info */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-5">Our Details</h2>
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">Address</p>
                    <p>20 Lomvardou Str. (Seafront Road, Zakynthos Town)<br />29100 Zakynthos, Greece</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">Phone</p>
                    <a href="tel:+302695041878" className="hover:text-blue-700 dark:hover:text-blue-400 block">+30 26950 41878</a>
                    <a href="tel:+306988010188" className="hover:text-blue-700 dark:hover:text-blue-400 block">+30 6988 010188</a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">Email</p>
                    <a href="mailto:customerservice@anadyon.gr" className="hover:text-blue-700 dark:hover:text-blue-400">customerservice@anadyon.gr</a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">Office Hours</p>
                    <p>Daily 09:00 – 21:00</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Contact Form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            {status === "sent" ? (
              <div className="text-center py-8">
                <h2 className="text-xl font-semibold text-green-600 mb-2">Message Sent!</h2>
                <p className="text-gray-500 dark:text-gray-400">Thank you for getting in touch. We'll reply as soon as possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Send a Message</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                    placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                    placeholder="your@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message *</label>
                  <textarea required rows={5} value={message} onChange={e => setMessage(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                    placeholder="How can we help?" />
                </div>
                <div className="w-full overflow-hidden flex flex-col justify-start gap-1">
                  <ReCAPTCHA
                    sitekey="6Lc_mjwtAAAAAKDT-iW8Lu9rql51ldO87Y9NQCvL"
                    onChange={(token: string | null) => setCaptchaToken(token)}
                    onExpired={() => setCaptchaToken(null)}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    This site is protected by reCAPTCHA and the Google{" "}
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Privacy Policy</a>{" "}
                    and{" "}
                    <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">Terms of Service</a>{" "}
                    apply.
                  </p>
                </div>
                {formError && (
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{formError}</p>
                )}
                {status === "error" && (
                  <p className="text-red-500 text-sm">Something went wrong. Please try again or email us directly.</p>
                )}
                <button type="submit" disabled={status === "sending"}
                  className="w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition disabled:opacity-50">
                  {status === "sending" ? "Sending..." : "Send Message"}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
