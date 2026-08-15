"use client";
import { useEffect, useState, useCallback } from "react";
import { Mail, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface Email {
  id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  greek_summary: string | null;
  suggested_action: string | null;
  category: string | null;
  urgency: number;
  status: string;
  received_at: string;
  reservation_date: string | null;
}

const URGENCY_COLORS: Record<number, string> = {
  1: "bg-gray-100 text-gray-600",
  2: "bg-yellow-50 text-yellow-700",
  3: "bg-red-50 text-red-700",
};

const STATUS_TABS = ["open", "replied", "closed", "all"] as const;

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("open");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/emails?status=${tab}&limit=100`)
      .then((r) => r.json())
      .then((d) => { setEmails(Array.isArray(d) ? d : []); setLoading(false); });
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    await fetch(`/api/admin/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    load();
  };

  const urgencyLabel = (u: number) =>
    u === 3 ? "Urgent" : u === 2 ? "Normal" : "Low";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition ${
              tab === s
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : emails.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">No emails in this view.</div>
      ) : (
        <div className="space-y-3">
          {emails.map((e) => (
            <div
              key={e.id}
              className={`rounded-xl border p-4 ${
                e.urgency === 3 ? "border-red-200 bg-red-50/30" :
                e.urgency === 2 ? "border-yellow-100 bg-white" :
                "border-gray-100 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${URGENCY_COLORS[e.urgency] ?? URGENCY_COLORS[2]}`}>
                      {urgencyLabel(e.urgency)}
                    </span>
                    {e.category && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {e.category}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(e.received_at).toLocaleString("el-GR")}
                    </span>
                  </div>
                  <div className="font-medium text-gray-900 text-sm truncate">
                    {e.sender_name ? `${e.sender_name} <${e.sender_email}>` : e.sender_email}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">{e.subject ?? "(no subject)"}</div>
                  {e.greek_summary && (
                    <div className="text-sm text-gray-700 bg-gray-50 rounded p-2 mb-1 border border-gray-100">
                      {e.greek_summary}
                    </div>
                  )}
                  {e.suggested_action && (
                    <div className="text-xs text-blue-600">→ {e.suggested_action}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {e.status === "open" && (
                    <>
                      <button
                        onClick={() => updateStatus(e.id, "replied")}
                        disabled={updating === e.id}
                        className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded hover:bg-green-100 transition"
                      >
                        <CheckCircle size={12} /> Replied
                      </button>
                      <button
                        onClick={() => updateStatus(e.id, "closed")}
                        disabled={updating === e.id}
                        className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition"
                      >
                        <XCircle size={12} /> Close
                      </button>
                    </>
                  )}
                  {e.status !== "open" && (
                    <button
                      onClick={() => updateStatus(e.id, "open")}
                      disabled={updating === e.id}
                      className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
