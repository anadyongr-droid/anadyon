"use client";
import { useCallback, useState } from "react";
import { Activity, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface HealthReport {
  ranAt: string;
  failing: number;
  checks: Check[];
}

/**
 * The health checks, somewhere they can be looked at.
 *
 * They have run daily since they were written, and every result went out
 * through Telegram and nowhere else. When that channel turned out never to
 * have worked, the checks kept passing their findings to it and nobody saw
 * one — including the check that exists to notice a stale backup, during the
 * days the backups were failing.
 *
 * So this does not wait to be told. It asks.
 */
export default function SiteHealthCard() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (!res.ok) {
        // A failed request is itself a finding, so it is shown rather than
        // swallowed into an empty panel that reads like good news.
        setError(`Could not run the checks (HTTP ${res.status}).`);
        return;
      }
      setReport(await res.json());
    } catch {
      setError("Could not reach the server to run the checks.");
    } finally {
      setRunning(false);
    }
  }, []);

  const failing = report?.failing ?? 0;

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-gray-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-900">Site health</h2>
            <p className="text-sm text-gray-500">
              Run live against production. Does not depend on Telegram.
            </p>
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={running ? "animate-spin" : undefined} />
          {running ? "Checking…" : report ? "Re-run" : "Run checks"}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!report && !error && !running && (
        <p className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
          Not run yet. Each run makes six live requests to production, so it happens on
          demand rather than on every visit to this page.
        </p>
      )}

      {report && (
        <>
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
              failing
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-green-50 border-green-200 text-green-700"
            }`}
          >
            {failing ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span className="font-medium">
              {failing
                ? `${failing} of ${report.checks.length} checks failing`
                : `All ${report.checks.length} checks passing`}
            </span>
          </div>

          <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {/* Failing first: the reason to open this panel is at the top. */}
            {[...report.checks]
              .sort((a, b) => Number(a.ok) - Number(b.ok))
              .map((check) => (
                <li key={check.name} className="flex items-start gap-3 py-2.5">
                  {check.ok ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0 text-green-600" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{check.name}</p>
                    <p className="text-sm text-gray-500 break-words">{check.detail}</p>
                  </div>
                </li>
              ))}
          </ul>

          <p className="mt-3 text-xs text-gray-500">
            Checked {new Date(report.ranAt).toLocaleString("en-GB")}
          </p>
        </>
      )}
    </div>
  );
}
