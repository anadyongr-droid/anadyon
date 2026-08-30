"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Where an invited person chooses their password.
 *
 * Without this page the invitation flow had nowhere to land. Supabase confirms
 * the address, issues a session and redirects to whatever the project's Site
 * URL says — which was still http://localhost:3000 — so the account ended up
 * confirmed but with no password and no way to sign in. The invite link is
 * single-use, so the person could not simply try again either.
 *
 * The same page serves a forgotten password, because Supabase delivers both as
 * the same kind of link and the person needs the same thing at the end of it.
 *
 * proxy.ts lets this through before its MFA gate. Someone arriving from an
 * *invitation* has a session but has not enrolled a second factor yet — they
 * cannot, they do not have a password. Enrolment happens straight afterwards,
 * and the proxy enforces it before anything else in the admin area opens.
 *
 * ─── And the case that reasoning missed ───
 *
 * A *reset* is the other half, and there the person already has a factor,
 * because the proxy made them enrol before it let them in. Supabase refuses a
 * password change from the AAL1 session a recovery link produces:
 *
 *     AAL2 session is required to update email or password when MFA is enabled.
 *
 * So until 30 August no established staff member could recover a forgotten
 * password — the one flow this page exists to serve for anyone who is not brand
 * new. The comment above was right about invitations and was never checked
 * against resets.
 *
 * The fix is to ask what the session needs rather than assume. When Supabase
 * says the next level is aal2, the code is collected and verified first, which
 * is the same challenge/verify pair app/admin/login/page.tsx already runs. An
 * invitation reports aal1 and goes straight through, untouched.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "saving" | "expired">("checking");
  const [error, setError] = useState<string | null>(null);

  // Set only when the session must reach aal2 before a password can be changed
  // — a reset on an account that has already enrolled. Null for an invitation,
  // which is the flow this page was originally written for.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    /**
     * Does this session have to prove a second factor before it may set a
     * password?
     *
     * Asked of Supabase rather than inferred. `nextLevel` is "aal2" exactly
     * when the account has a verified factor, which is every account the proxy
     * has ever let into the admin area — and "aal1" for an invitation, which
     * goes straight through as before.
     *
     * A failure here is deliberately not fatal: the person still sees the form,
     * and if the factor really was needed the update returns Supabase's own
     * message rather than this screen inventing one.
     */
    const resolveFactor = async () => {
      const [{ data: aal }, { data: factors }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      const totp = factors?.totp?.find((f) => f.status === "verified") ?? factors?.totp?.[0];
      if (aal?.nextLevel === "aal2" && totp) setFactorId(totp.id);
    };

    // The tokens are read out of the fragment and handed to the client
    // explicitly, rather than waiting for it to notice them.
    //
    // createBrowserClient from @supabase/ssr is built for cookie-based server
    // rendering and does not pick a session out of the URL the way the plain
    // browser client does. Verified rather than assumed: on a real recovery
    // link the fragment carried a token that Supabase accepted with a 200,
    // while the page had no session and had set no cookie at all — so this
    // screen told the person their link had expired when it was perfectly
    // good.
    const establish = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!sessionError) {
          // Clears the tokens from the address bar and from history once they
          // have been exchanged for a session. A recovery URL is a credential.
          window.history.replaceState(null, "", window.location.pathname);
          await resolveFactor();
          setStatus("ready");
          return;
        }
      }

      // No tokens, or they were refused: either the link was already used, or
      // the person arrived here directly.
      const { data } = await supabase.auth.getSession();
      if (data.session) await resolveFactor();
      setStatus(data.session ? "ready" : "expired");
    };

    establish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Use at least 12 characters. Length matters more than symbols.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    if (factorId && totpCode.replace(/\s/g, "").length < 6) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setStatus("saving");

    // Raise the session to aal2 first, or Supabase refuses the change outright.
    // Verifying afterwards would be too late: the update is what gets rejected.
    if (factorId) {
      const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId });
      if (ce || !challenge) {
        setError("Could not start verification. Please try again.");
        setStatus("ready");
        return;
      }
      const { error: ve } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: totpCode.replace(/\s/g, ""),
      });
      if (ve) {
        setError("Incorrect code. Please try again.");
        setTotpCode("");
        setStatus("ready");
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setStatus("ready");
      return;
    }
    // The proxy sends them to enrol a second factor before anything opens.
    router.push("/admin");
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="animate-spin text-gray-600" size={28} />
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link has already been used</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Invitation and reset links work once. Ask an administrator to send a new
            one from the Users screen, or use the reset link on the sign-in page.
          </p>
          <a href="/admin/login" className="inline-flex items-center min-h-11 px-4 bg-orange-700 text-white font-semibold rounded-lg hover:bg-orange-800 transition">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <form onSubmit={save} className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
          <ShieldCheck size={20} />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Choose a password</h1>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {factorId
            ? "Only you will know it. Confirm the change with your authenticator app below."
            : "Only you will know it. You will be asked to set up two-factor authentication immediately after."}
        </p>

        {error && (
          <div role="alert" className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Repeat it</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </label>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          At least 12 characters. A few unrelated words are stronger and easier to
          remember than a short one with symbols in it.
        </p>

        {/* Only for a reset on an account that has already enrolled. An
            invitation never sees this, because there is no factor to prove. */}
        {factorId && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Code from your authenticator app
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={7}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="mt-1 w-full min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white tracking-widest"
            />
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Changing a password needs the second factor as well, so nobody with
              only your email can take the account.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full min-h-11 bg-orange-700 text-white font-semibold rounded-lg hover:bg-orange-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {status === "saving" && <Loader2 size={16} className="animate-spin" />}
          Save and continue
        </button>
      </form>
    </div>
  );
}
