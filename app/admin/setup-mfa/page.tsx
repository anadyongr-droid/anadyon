"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function SetupMFA() {
  const router = useRouter();
  const supabase = createClient();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(true);

  useEffect(() => {
    async function startEnrollment() {
      // Clear any stale unverified factors from previous failed attempts
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = existing?.totp?.filter(f => f.status === "unverified") ?? [];
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Anadyon Admin",
      });
      setEnrolling(false);
      if (e || !data) {
        setError("Failed to start setup. Please sign out and try again.");
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    }
    startEnrollment();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError("");

    const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId });
    if (ce || !challenge) {
      setError("Could not start verification. Refresh and try again.");
      setLoading(false);
      return;
    }

    const { error: ve } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ""),
    });

    setLoading(false);
    if (ve) {
      setError("Incorrect code — check the app and try again.");
      setCode("");
      return;
    }

    router.push("/admin");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-gray-900">Set up 2FA</div>
          <p className="text-sm text-gray-500 mt-1">One-time setup — takes about 1 minute</p>
        </div>

        {enrolling && (
          <p className="text-center text-gray-400 text-sm py-6">Preparing setup…</p>
        )}

        {!enrolling && error && !qrCode && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {qrCode && (
          <div className="space-y-5">
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Install <strong>Google Authenticator</strong> or <strong>Authy</strong> on your phone</li>
              <li>Tap <strong>＋</strong> and choose <strong>Scan a QR code</strong></li>
              <li>Point your camera at the code below</li>
              <li>Enter the 6-digit code the app shows</li>
            </ol>

            <div
              className="flex justify-center rounded-lg border border-gray-200 p-3 bg-white"
              dangerouslySetInnerHTML={{ __html: qrCode }}
            />

            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer select-none hover:text-gray-600">
                Can&apos;t scan? Enter the key manually instead
              </summary>
              <p className="mt-2 font-mono break-all select-all bg-gray-50 rounded p-2 text-gray-700">
                {secret}
              </p>
            </details>

            <form onSubmit={handleVerify} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="000 000"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center tracking-widest text-xl font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || code.replace(/\s/g, "").length < 6}
                className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition text-sm disabled:opacity-50"
              >
                {loading ? "Activating…" : "Activate 2FA"}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center">
              Keep your authenticator app installed — you&apos;ll need it every time you sign in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
