"use client";
import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Trash2, UserPlus, Loader2, Send } from "lucide-react";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from "@/lib/roles";

interface ListedUser {
  id: string;
  email: string;
  role: Role | null;
  mfaEnrolled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  invitePending: boolean;
}

function when(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function UsersClient() {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("staff");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load users");
      setUsers(body.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send the invitation");
      setNotice(`Invitation sent to ${body.email}. They choose their own password from the email.`);
      setInviteEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invitation");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(user: ListedUser, role: Role) {
    setBusy(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not change the role");
      setNotice(`${user.email} is now ${ROLE_LABELS[role]}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the role");
      await load();
    } finally {
      setBusy(null);
    }
  }

  /**
   * Sends a fresh password link.
   *
   * Invitations are single-use. If one is opened and the redirect fails, the
   * account is left confirmed but without a password and the link is spent —
   * which is exactly what happened when the project's Site URL still pointed
   * at localhost. This is the way back, and it belongs here rather than in the
   * Supabase console.
   */
  async function resend(user: ListedUser) {
    setBusy(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", email: user.email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send the link");
      setNotice(`A new password link is on its way to ${user.email}. It works once.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the link");
    } finally {
      setBusy(null);
    }
  }

  async function remove(user: ListedUser) {
    if (!confirm(`Remove ${user.email}? They lose access immediately and this cannot be undone.`)) return;
    setBusy(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not remove the user");
      setNotice(`${user.email} no longer has access.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the user");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users &amp; Access</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
          Everyone who can sign in to this admin area. New people are invited by email and
          choose their own password — no one else ever sees it.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          {notice}
        </div>
      )}

      {/* ── Invite ─────────────────────────────────────────────────────── */}
      <form onSubmit={invite} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <UserPlus size={18} className="text-orange-700 dark:text-orange-400" />
          Invite someone
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1">
            <span className="sr-only">Email address</span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@anadyon.gr"
              className="w-full min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </label>
          <label className="sm:w-48">
            <span className="sr-only">Role</span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="w-full min-h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={inviting}
            className="min-h-11 px-5 bg-orange-700 text-white font-semibold rounded-lg hover:bg-orange-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {inviting && <Loader2 size={16} className="animate-spin" />}
            Send invitation
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {ROLE_DESCRIPTIONS[inviteRole]}
        </p>
      </form>

      {/* ── Existing users ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/60 text-left">
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Email</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Two-factor</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Last sign in</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  <Loader2 size={18} className="animate-spin inline mr-2" />Loading…
                </td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No users.</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-white">{u.email}</span>
                    {u.invitePending && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                        invite pending
                      </span>
                    )}
                    {u.role === null && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                        no role — cannot sign in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role ?? ""}
                      disabled={busy === u.id}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      aria-label={`Role for ${u.email}`}
                      className="min-h-11 px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white disabled:opacity-50"
                    >
                      {u.role === null && <option value="">— none —</option>}
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.mfaEnrolled ? (
                      <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
                        <ShieldCheck size={16} /> Enrolled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <ShieldAlert size={16} /> Set up on first sign in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{when(u.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => resend(u)}
                      disabled={busy === u.id}
                      aria-label={`Send a new password link to ${u.email}`}
                      title="Send a new password link"
                      className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40"
                    >
                      <Send size={16} />
                    </button>
                    <button
                      onClick={() => remove(u)}
                      disabled={busy === u.id}
                      aria-label={`Remove ${u.email}`}
                      className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-40"
                    >
                      {busy === u.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 max-w-2xl">
        <p>
          <strong className="text-gray-700 dark:text-gray-300">Admin</strong> — {ROLE_DESCRIPTIONS.admin}
        </p>
        <p>
          <strong className="text-gray-700 dark:text-gray-300">User</strong> — {ROLE_DESCRIPTIONS.staff}
        </p>
        <p className="pt-2">
          Two-factor is compulsory: anyone signing in without it is sent to set it up before
          they can reach anything. You cannot change your own role or remove your own account,
          and the last remaining admin cannot be removed.
        </p>
      </div>
    </div>
  );
}
