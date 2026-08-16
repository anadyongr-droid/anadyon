"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download } from "lucide-react";

interface Progress {
  total: number;
  completed: number;
  remaining: number;
  done: boolean;
  rowsStored: number;
}

/**
 * Runs the EzCar rate collection.
 *
 * ezcar.eu asks for 10 seconds between requests, so the server handles four
 * searches per call and this drives it round until the matrix is finished —
 * roughly four minutes for a full pass.
 */
export default function CompetitorRatesCard() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faros, setFaros] = useState<string | null>(null);
  const [farosRunning, setFarosRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/competitors/scrape");
      if (res.ok) setProgress(await res.json());
    } catch {
      // leave the last known progress in place
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function collect(restart: boolean) {
    setRunning(true);
    setError(null);
    try {
      // Keep calling until the server reports the matrix is complete. Bounded so
      // a persistent failure cannot spin indefinitely.
      for (let call = 0; call < 20; call++) {
        const url = `/api/admin/competitors/scrape${restart && call === 0 ? "?restart=1" : ""}`;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Collection failed.");
          break;
        }
        setProgress({
          total: data.total,
          completed: data.completed,
          remaining: data.remaining ?? 0,
          done: data.done,
          rowsStored: progress?.rowsStored ?? 0,
        });
        if (data.errors?.length) setError(data.errors[0]);
        if (data.done) break;
      }
    } catch {
      setError("Could not reach the server.");
    }
    await refresh();
    setRunning(false);
  }

  async function collectFaros() {
    setFarosRunning(true);
    setFaros("Starting browser run…");
    try {
      const start = await fetch("/api/admin/competitors/faros", { method: "POST" });
      const startData = await start.json();
      if (!start.ok) { setFaros(startData.error ?? "Could not start."); setFarosRunning(false); return; }

      // The Apify run outlives a serverless request, so poll for it.
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 8000));
        const res = await fetch("/api/admin/competitors/faros");
        const d = await res.json();
        if (d.status === "SUCCEEDED") {
          setFaros(d.alreadyIngested ? "Already collected." : `${d.stored} prices from ${d.searches} searches.`);
          break;
        }
        if (d.status === "ERROR" || d.status === "FAILED" || d.status === "ABORTED") {
          setFaros(d.error ?? `Run ${d.status}.`);
          break;
        }
        setFaros(`Running… (${d.status})`);
      }
    } catch {
      setFaros("Could not reach the server.");
    }
    setFarosRunning(false);
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <BarChart3 size={18} className="text-gray-500 mt-0.5" />
          <div>
            <div className="font-medium text-gray-900 text-sm">Competitor rates</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Ionian Rentals and Motor Club Zante, via EzCar — August, September and October.
            </div>
            {progress && (
              <div className="text-xs text-gray-500 mt-2">
                {progress.completed} of {progress.total} searches
                {progress.rowsStored > 0 && ` · ${progress.rowsStored} prices stored`}
                {progress.done && progress.completed > 0 && " · complete"}
              </div>
            )}
            {error && <div className="text-xs text-red-600 mt-1.5">{error}</div>}
          </div>
        </div>

        <button
          onClick={() => collect(progress?.done ?? false)}
          disabled={running}
          className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
        >
          <Download size={14} className={running ? "animate-pulse" : ""} />
          {running ? "Collecting…" : progress?.done ? "Refresh" : "Collect"}
        </button>
      </div>

      {progress && progress.total > 0 && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {running && (
        <div className="text-xs text-gray-400 mt-2">
          Pausing 10 seconds between searches, as ezcar.eu requests. A full pass takes about four minutes.
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-gray-900 text-sm">Faros Rentals</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Runs through Apify, since Faros refuses non-browser requests. Three-day minimum rental,
            so no 1–2 day prices.
          </div>
          {faros && <div className="text-xs text-gray-500 mt-1.5">{faros}</div>}
        </div>
        <button
          onClick={collectFaros}
          disabled={farosRunning}
          className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
        >
          <Download size={14} className={farosRunning ? "animate-pulse" : ""} />
          {farosRunning ? "Running…" : "Collect Faros"}
        </button>
      </div>
    </div>
  );
}
