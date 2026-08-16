"use client";
import { useEffect, useState, useCallback } from "react";
import { Mail, RefreshCw, CheckCircle, XCircle, Download, Sparkles, ChevronDown, ChevronRight } from "lucide-react";

interface Email {
  id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  body_text: string | null;
  greek_summary: string | null;
  suggested_action: string | null;
  category: string | null;
  urgency: number;
  status: string;
  received_at: string;
  reservation_date: string | null;
  gmail_thread_id: string | null;
}

const URGENCY_STYLE: Record<number, string> = {
  1: "bg-gray-100 text-gray-600",
  2: "bg-yellow-50 text-yellow-700",
  3: "bg-red-100 text-red-700",
};

const STATUS_TABS = ["open", "replied", "closed", "all"] as const;

type Note = { ok: boolean; text: string } | null;

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("open");
  const [updating, setUpdating] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "sync" | "reclassify">(null);
  const [note, setNote] = useState<Note>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const runAction = async (kind: "sync" | "reclassify") => {
    setBusy(kind);
    setNote(null);
    try {
      const url = kind === "sync" ? "/api/admin/emails/sync" : "/api/admin/emails/reclassify";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setNote({ ok: false, text: data.error ?? "Failed. Check Gmail is connected in Settings." });
      } else if (kind === "sync") {
        const parts: string[] = [];
        parts.push(data.inserted === 0 ? "No new email" : `${data.inserted} imported`);
        if (data.remaining > 0) parts.push(`${data.remaining} still queued — press Sync again`);
        setNote({ ok: true, text: parts.join(" · ") });
        if (data.inserted > 0) load();
      } else {
        setNote({
          ok: true,
          text: data.updated === 0
            ? `No emails needed re-classifying (${data.scanned} checked)`
            : `${data.updated} of ${data.scanned} re-classified`,
        });
        if (data.updated > 0) load();
      }
    } catch {
      setNote({ ok: false, text: "Could not reach the server." });
    }
    setBusy(null);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const urgencyLabel = (u: number) => (u === 3 ? "Επείγον" : u === 2 ? "Normal" : "Low");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
        </div>
        <div className="flex items-center gap-3">
          {note && (
            <span className={`text-xs ${note.ok ? "text-gray-500" : "text-red-600"}`}>{note.text}</span>
          )}
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => runAction("reclassify")}
            disabled={busy !== null}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
          >
            <Sparkles size={14} className={busy === "reclassify" ? "animate-pulse" : ""} />
            {busy === "reclassify" ? "Working…" : "Re-classify"}
          </button>
          <button
            onClick={() => runAction("sync")}
            disabled={busy !== null}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
          >
            <Download size={14} className={busy === "sync" ? "animate-pulse" : ""} />
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </button>
        </div>
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
          {emails.map((e) => {
            const open = expanded.has(e.id);
            return (
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
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${URGENCY_STYLE[e.urgency] ?? URGENCY_STYLE[2]}`}>
                        {urgencyLabel(e.urgency)}
                      </span>
                      {e.category && (
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {e.category}
                        </span>
                      )}
                      {e.reservation_date && (
                        <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                          Ημ. Κράτησης: {e.reservation_date}
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

                    {e.greek_summary ? (
                      <div className="text-sm text-gray-700 bg-gray-50 rounded p-2 mb-1 border border-gray-100">
                        {e.greek_summary}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-600 mb-1">
                        Not classified yet — press Re-classify.
                      </div>
                    )}

                    {e.suggested_action && (
                      <div className="text-xs text-blue-700 mb-1">→ {e.suggested_action}</div>
                    )}

                    {e.body_text && (
                      <>
                        <button
                          onClick={() => toggle(e.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mt-1"
                        >
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {open ? "Hide full email" : "Show full email"}
                        </button>
                        {open && (
                          <pre className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-sans">
                            {e.body_text}
                          </pre>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    {e.status === "open" ? (
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
                    ) : (
                      <button
                        onClick={() => updateStatus(e.id, "open")}
                        disabled={updating === e.id}
                        className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition"
                      >
                        Reopen
                      </button>
                    )}
                    <span className="text-[10px] text-gray-400 text-center capitalize">{e.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
