"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, PencilLine, Save } from "lucide-react";

interface GroupRow {
  competitor: string;
  competitor_label: string;
  car_group: string;
  samples: string[];
  transmission: string | null;
  observations: number;
  min_price: number | null;
  max_price: number | null;
  pricing_group: string | null;
}

interface CompCell {
  competitor: string;
  label: string;
  price: number | null;
  diffPct: number | null;
}

interface CompareRow {
  pricing_group: string;
  season_name: string;
  month_name: string;
  band_label: string;
  ours: number;
  competitors: CompCell[];
}

const OUR_GROUPS = [
  { value: "", label: "— unmapped —" },
  { value: "car_a", label: "Car A (Micra)" },
  { value: "car_b", label: "Car B (i20)" },
  { value: "car_c", label: "Car C (Automatic)" },
  { value: "motorbike_a", label: "Motorbike A (50cc)" },
  { value: "motorbike_b", label: "Motorbike B (125cc+)" },
  { value: "bike", label: "Bicycle" },
  { value: "ignore", label: "Ignore (not comparable)" },
];

const GROUP_LABEL: Record<string, string> = {
  car_a: "Car A (Micra)",
  car_b: "Car B (i20)",
  car_c: "Car C (Automatic)",
  motorbike_a: "Motorbike A",
  motorbike_b: "Motorbike B",
  bike: "Bicycle",
};

export default function MarketPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [competitors, setCompetitors] = useState<{ slug: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadComparison = useCallback(async () => {
    const res = await fetch("/api/admin/competitors/comparison");
    if (!res.ok) return;
    const d = await res.json();
    setRows(d.rows ?? []);
    setCompetitors(d.competitors ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/competitors/mapping");
      if (res.ok) setGroups((await res.json()).groups ?? []);
      await loadComparison();
      setLoading(false);
    })();
  }, [loadComparison]);

  function setMapping(competitor: string, carGroup: string, value: string) {
    setGroups(prev =>
      prev.map(g =>
        g.competitor === competitor && g.car_group === carGroup
          ? { ...g, pricing_group: value || null }
          : g
      )
    );
  }

  async function save() {
    setSaving(true);
    setNote(null);
    const res = await fetch("/api/admin/competitors/mapping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: groups.map(g => ({
          competitor: g.competitor,
          car_group: g.car_group,
          pricing_group: g.pricing_group,
        })),
      }),
    });
    const d = await res.json();
    setNote(res.ok ? `Saved — ${d.updated} observations classified.` : d.error ?? "Save failed.");
    if (res.ok) await loadComparison();
    setSaving(false);
  }

  const mappedCount = groups.filter(g => g.pricing_group && g.pricing_group !== "ignore").length;

  // Comparison grouped by our pricing group
  const byGroup = rows.reduce<Record<string, CompareRow[]>>((acc, r) => {
    (acc[r.pricing_group] ??= []).push(r);
    return acc;
  }, {});

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Market</h1>
        </div>
        <Link
          href="/admin/rates"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          <PencilLine size={15} /> Edit Rates
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Cars and scooters from EzCar, bicycles from Podilatadiko, international brands from
        CarRentals.com. Each comparison covers only the categories mapped at the foot of this page.
      </p>

      {/* Comparison */}
      <h2 className="font-semibold text-gray-900 text-sm mb-3">Comparison</h2>
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400 text-center">
          Nothing to compare yet — map at least one of their categories to one of yours in
          the mapping table below, then save.
        </div>
      ) : (
        Object.entries(byGroup).map(([group, groupRows]) => (
          <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 text-sm">{GROUP_LABEL[group] ?? group}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left px-5 py-2 font-medium">Month</th>
                    <th className="text-left px-3 py-2 font-medium">Duration</th>
                    <th className="text-right px-3 py-2 font-medium">You</th>
                    {competitors.map(c => (
                      <th key={c.slug} className="text-right px-4 py-2 font-medium whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-5 py-2 text-gray-700">{r.month_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.band_label}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                        €{r.ours}
                      </td>
                      {r.competitors.map(c => (
                        <td key={c.competitor} className="px-4 py-2 text-right tabular-nums">
                          {c.price === null ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <>
                              <span className="text-gray-700">€{c.price}</span>
                              {c.diffPct !== null && (
                                <span
                                  className={`ml-2 text-xs ${
                                    c.diffPct < -10
                                      ? "text-amber-600"
                                      : c.diffPct > 10
                                      ? "text-blue-600"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {c.diffPct > 0 ? "+" : ""}
                                  {c.diffPct}%
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {rows.length > 0 && (
        <p className="text-xs text-gray-400">
          Percentages show your price against theirs. Amber means you are more than 10% below;
          blue means more than 10% above.
        </p>
      )}

      {/* Mapping */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Category mapping</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mappedCount} of {groups.length} categories mapped
            </p>
          </div>
          <div className="flex items-center gap-3">
            {note && <span className="text-xs text-gray-500">{note}</span>}
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save mapping"}
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="text-left px-5 py-2 font-medium">Competitor</th>
              <th className="text-left px-3 py-2 font-medium">Their group</th>
              <th className="text-left px-3 py-2 font-medium">Vehicles</th>
              <th className="text-left px-3 py-2 font-medium">Transmission</th>
              <th className="text-right px-3 py-2 font-medium">€/day range</th>
              <th className="text-left px-4 py-2 font-medium">Maps to</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={`${g.competitor}-${g.car_group}`} className="border-b border-gray-50">
                <td className="px-5 py-2 text-gray-500 text-xs">{g.competitor_label}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{g.car_group}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">{g.samples.join(", ")}</td>
                <td className="px-3 py-2">
                  {g.transmission ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        g.transmission === "Automatic"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {g.transmission}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-500 text-xs tabular-nums">
                  {g.min_price !== null
                    ? g.min_price === g.max_price
                      ? `€${g.min_price}`
                      : `€${g.min_price}–${g.max_price}`
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={g.pricing_group ?? ""}
                    onChange={e => setMapping(g.competitor, g.car_group, e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {OUR_GROUPS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
