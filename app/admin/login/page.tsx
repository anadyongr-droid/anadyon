"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type Step = "credentials" | "totp";

export default function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mfaRequired = !!searchParams.get("mfa");

  const [step, setStep] = useState<Step>(mfaRequired ? "totp" : "credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  // If redirected back with ?mfa=1 (session exists but MFA not yet verified), load the factor
  useEffect(() => {
    if (mfaRequired) {
      supabase.auth.mfa.listFactors().then(({ data }) => {
        const totp = data?.totp?.[0];
        if (totp) setFactorId(totp.id);
      });
    }
  }, [mfaRequired]);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError("Incorrect email or password.");
      return;
    }

    // Check MFA status
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];

    setLoading(false);

    if (aal?.nextLevel === "aal2" && totp) {
      // MFA enrolled — ask for the code
      setFactorId(totp.id);
      setStep("totp");
    } else if (!totp) {
      // First login — send to MFA setup
      router.push("/admin/setup-mfa");
    } else {
      router.push("/admin");
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError("");

    const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId });
    if (ce || !challenge) {
      setError("Could not start verification. Please try again.");
      setLoading(false);
      return;
    }

    const { error: ve } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: totpCode.replace(/\s/g, ""),
    });

    setLoading(false);

    if (ve) {
      setError("Incorrect code. Please try again.");
      setTotpCode("");
      return;
    }

    router.push("/admin");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-gray-900">Anadyon</div>
          <div className="text-sm text-gray-500 mt-1">Admin Panel</div>
        </div>

        {step === "credentials" && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition text-sm disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {step === "totp" && (
          <form onSubmit={handleTotp} className="space-y-4">
            <div className="text-center mb-2">
              <div className="text-4xl mb-3">🔐</div>
              <p className="text-sm text-gray-600">
                Open <strong>Google Authenticator</strong> (or Authy) and enter the 6-digit code for <em>Anadyon Admin</em>.
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              value={totpCode}
              onChange={e => setTotpCode(e.target.value)}
              placeholder="000 000"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center tracking-widest text-xl font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || totpCode.replace(/\s/g, "").length < 6}
              className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-800 transition text-sm disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            {!mfaRequired && (
              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 text-center"
              >
                ← Back to sign in
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
