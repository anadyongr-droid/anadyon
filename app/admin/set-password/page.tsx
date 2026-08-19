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
 * proxy.ts lets this through before its MFA gate. Someone arriving here has a
 * session but has not enrolled a second factor yet — they cannot, they do not
 * have a password. Enrolment happens straight afterwards, and the proxy
 * enforces it before anything else in the admin area opens.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "saving" | "expired">("checking");
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    // Supabase puts the tokens in the URL fragment, which the client library
    // picks up on load. A short wait then tells us whether a session exists —
    // if not, the link was already used or has expired.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      setStatus(data.session ? "ready" : "expired");
    };
    const timer = setTimeout(check, 400);
    return () => clearTimeout(timer);
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

    setStatus("saving");
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
        <Loader2 className="animate-spin text-gray-400" size={28} />
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
          Only you will know it. You will be asked to set up two-factor
          authentication immediately after.
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
