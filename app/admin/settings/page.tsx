"use client";
import { useEffect, useState } from "react";
import { Settings, Mail, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SettingsContent() {
  const searchParams = useSearchParams();
  const gmailStatus = searchParams.get("gmail");

  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailAuthUrl, setGmailAuthUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/gmail")
      .then((r) => r.json())
      .then((d) => {
        setGmailConnected(d.connected);
        setGmailAuthUrl(d.authUrl ?? null);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={20} className="text-gray-600" />
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      {gmailStatus === "connected" && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle size={16} /> Gmail connected successfully.
        </div>
      )}
      {gmailStatus === "error" && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> Gmail connection failed. Please try again.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Gmail Integration */}
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Mail size={20} className="text-red-500 mt-0.5" />
              <div>
                <div className="font-semibold text-gray-900 text-sm">Gmail Integration</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Sync customerservice@anadyon.gr for AI-powered email intelligence
                </div>
              </div>
            </div>
            <div className="ml-4">
              {loading ? (
                <span className="text-xs text-gray-400">Loading…</span>
              ) : gmailConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                  <CheckCircle size={12} /> Connected
                </span>
              ) : (
                <a
                  href={gmailAuthUrl ?? "#"}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-700 px-4 py-2 rounded-lg hover:bg-blue-800 transition"
                >
                  Connect Gmail <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 mt-0.5 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold">T</div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Telegram Alerts</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Operational alerts sent to channel <code className="bg-gray-100 px-1 rounded">-1003920236402</code>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Set <code className="bg-gray-100 px-1 rounded">TELEGRAM_BOT_TOKEN</code> in Vercel environment variables to enable.
              </div>
            </div>
          </div>
        </div>

        {/* Stripe */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 mt-0.5 rounded bg-purple-600 flex items-center justify-center text-white text-xs font-bold">$</div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Stripe Deposits</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Create payment links for reservation deposits from the reservation detail page.
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Requires <code className="bg-gray-100 px-1 rounded">STRIPE_SECRET_KEY</code> and <code className="bg-gray-100 px-1 rounded">STRIPE_WEBHOOK_SECRET</code> in Vercel.
              </div>
            </div>
          </div>
        </div>

        {/* Twilio */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 mt-0.5 rounded bg-red-600 flex items-center justify-center text-white text-xs font-bold">S</div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Twilio SMS</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Send booking reminders and confirmations via SMS from the reservation detail page.
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Requires <code className="bg-gray-100 px-1 rounded">TWILIO_ACCOUNT_SID</code>, <code className="bg-gray-100 px-1 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="bg-gray-100 px-1 rounded">TWILIO_FROM_NUMBER</code> in Vercel.
              </div>
            </div>
          </div>
        </div>

        {/* AADE */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 mt-0.5 rounded bg-blue-700 flex items-center justify-center text-white text-xs font-bold">Α</div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">AADE myDATA</div>
              <div className="text-xs text-gray-500 mt-0.5">
                DCL (Digital Client List) and e-Invoicing. Submit from the reservation detail page.
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Requires <code className="bg-gray-100 px-1 rounded">AADE_USER_ID</code>, <code className="bg-gray-100 px-1 rounded">AADE_SUBSCRIPTION_KEY</code>, and <code className="bg-gray-100 px-1 rounded">COMPANY_VAT_NUMBER</code> in Vercel.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
