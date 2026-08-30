"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, PencilLine, Save, X } from "lucide-react";
import type { Rate } from "@/lib/pricing";
import { useIsAdmin } from "../RoleContext";

type RateField = "rate_1_2" | "rate_3_6" | "rate_7plus";

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
  rate_id: string;
  rate_field: RateField;
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
  // Presentation only — proxy.ts refuses the underlying PATCHes from staff
  // regardless. Here so they are not offered edits that cannot save.
  const isAdmin = useIsAdmin();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [competitors, setCompetitors] = useState<{ slug: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editingRates, setEditingRates] = useState(false);
  // The mapping is read far more often than it is changed, and a stray tap on a
  // phone should not be able to reclassify a competitor category. The dropdowns
  // stay disabled until Edit is pressed.
  const [editingMapping, setEditingMapping] = useState(false);
  // What was last loaded or saved, so Cancel can put it back.
  const [pristineGroups, setPristineGroups] = useState<GroupRow[]>([]);
  const [rateDrafts, setRateDrafts] = useState<Rate[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);
  const [rateNote, setRateNote] = useState<string | null>(null);

  const loadComparison = useCallback(async () => {
    const res = await fetch("/api/admin/competitors/comparison");
    if (!res.ok) return;
    const d = await res.json();
    setRows(d.rows ?? []);
    setCompetitors(d.competitors ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      // These two do not depend on each other. Awaiting the mapping before
      // starting the comparison made the screen wait for two round trips in
      // series, which is most of why it looked half-loaded.
      await Promise.all([
        (async () => {
          const res = await fetch("/api/admin/competitors/mapping");
          if (!res.ok) return;
          const loaded: GroupRow[] = (await res.json()).groups ?? [];
          setGroups(loaded);
          // Seeded here as well as after a save, so Cancel works on a screen
          // that has never been saved.
          setPristineGroups(loaded);
        })(),
        loadComparison(),
      ]);
      setLoading(false);
    })();
  }, [loadComparison]);

  const canEditMapping = isAdmin && editingMapping;

  function startMappingEdit() { setEditingMapping(true); setNote(null); }

  function cancelMappingEdit() {
    setGroups(pristineGroups);
    setEditingMapping(false);
    setNote(null);
  }

  function setMapping(competitor: string, carGroup: string, value: string) {
    setGroups(prev =>
      prev.map(g =>
        g.competitor === competitor && g.car_group === carGroup
          ? { ...g, pricing_group: value || null }
          : g
      )
    );
  }

  async function startRateEditing() {
    setRateLoading(true);
    setRateNote(null);
    const res = await fetch("/api/admin/rates?fresh=1", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setRateNote(data.error ?? "Rates could not be loaded.");
      setRateLoading(false);
      return;
    }
    setRateDrafts(data.rates ?? []);
    setEditingRates(true);
    setRateLoading(false);
  }

  function updateRate(id: string, field: RateField, value: string) {
    const amount = Number(value);
    setRateDrafts(prev => prev.map(rate =>
      rate.id === id ? { ...rate, [field]: Number.isFinite(amount) ? amount : 0 } : rate
    ));
  }

  async function saveRates() {
    setRateSaving(true);
    setRateNote(null);
    const res = await fetch("/api/admin/rates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates: rateDrafts }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRateNote(data.errors?.join("; ") ?? data.error ?? "Rates could not be saved.");
      setRateSaving(false);
      return;
    }
    await loadComparison();
    setEditingRates(false);
    setRateSaving(false);
    setRateNote("Rates saved. The comparison now uses the new values.");
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
    if (res.ok) {
      // A successful save becomes the new baseline and closes the edit session,
      // so Cancel can never revert to classifications already written, and the
      // dropdowns are not left live behind the user.
      setPristineGroups(groups);
      setEditingMapping(false);
      await loadComparison();
    }
    // A failed save keeps the session open — the edits are still on screen and
    // still the only copy of them.
    setSaving(false);
  }

  const mappedCount = groups.filter(g => g.pricing_group && g.pricing_group !== "ignore").length;

  // Comparison grouped by our pricing group
  const byGroup = rows.reduce<Record<string, CompareRow[]>>((acc, r) => {
    (acc[r.pricing_group] ??= []).push(r);
    return acc;
  }, {});

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Market</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {rateNote && <span className="max-w-72 text-right text-xs text-gray-500">{rateNote}</span>}
          {/* Editing Anadyon's own rates from here writes to /api/admin/rates,
              which staff may only read. The competitor columns and the import
              buttons stay available to everyone. */}
          {!isAdmin ? (
            <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
              View only — rates are set by an administrator
            </span>
          ) : editingRates ? (
            <>
              <button
                type="button"
                onClick={() => { setEditingRates(false); setRateNote(null); }}
                disabled={rateSaving}
                aria-label="Cancel rate changes"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                onClick={saveRates}
                disabled={rateSaving}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
              >
                <Save size={15} /> {rateSaving ? "Saving…" : "Save Rates"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startRateEditing}
              disabled={rateLoading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              <PencilLine size={15} /> {rateLoading ? "Loading…" : "Edit Rates"}
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Cars and scooters from EzCar, bicycles from Podilatadiko, international brands from
        CarRentals.com. Each comparison covers only the categories mapped at the foot of this page.
      </p>

      {/* Comparison */}
      <h2 className="font-semibold text-gray-900 text-sm mb-3">Comparison</h2>
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600 text-center">
          Nothing to compare yet — map at least one of their categories to one of yours in
          the mapping table below, then save.
        </div>
      ) : (
        Object.entries(byGroup).map(([group, groupRows]) => (
          <div key={group} className="bg-white rounded-xl border border-gray-200 mb-5">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 text-sm">{GROUP_LABEL[group] ?? group}</h3>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table w-full text-sm">
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
                  {groupRows.map((r, i) => {
                    const draft = rateDrafts.find(rate => rate.id === r.rate_id);
                    const displayedOurs = editingRates && draft ? Number(draft[r.rate_field]) : r.ours;
                    return (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-5 py-2 text-gray-700">{r.month_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.band_label}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                        {editingRates ? (
                          <label className="inline-flex items-center justify-end gap-1">
                            <span className="text-xs font-normal text-gray-600">€</span>
                            <span className="sr-only">Our rate for {r.month_name}, {r.band_label}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={displayedOurs}
                              onChange={event => updateRate(r.rate_id, r.rate_field, event.target.value)}
                              className="w-20 rounded border border-blue-300 px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </label>
                        ) : `€${r.ours}`}
                      </td>
                      {r.competitors.map(c => {
                        const diffPct = c.price === null || !c.price
                          ? null
                          : Math.round(((displayedOurs - c.price) / c.price) * 100);
                        return (
                        <td key={c.competitor} className="px-4 py-2 text-right tabular-nums">
                          {c.price === null ? (
                            <span className="text-gray-500">—</span>
                          ) : (
                            <>
                              <span className="text-gray-700">€{c.price}</span>
                              {diffPct !== null && (
                                <span
                                  className={`ml-2 text-xs ${
                                    diffPct < -10
                                      ? "text-amber-600"
                                      : diffPct > 10
                                      ? "text-blue-600"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {diffPct > 0 ? "+" : ""}
                                  {diffPct}%
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      )})}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {rows.length > 0 && (
        <p className="text-xs text-gray-600">
          Percentages show your price against theirs. Amber means you are more than 10% below;
          blue means more than 10% above.
        </p>
      )}

      {/* Mapping */}
      <div className="bg-white rounded-xl border border-gray-200 mb-8">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Category mapping</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mappedCount} of {groups.length} categories mapped
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {note && <span className="max-w-72 text-right text-xs text-gray-500">{note}</span>}
            {/* Staff read the mapping; they do not change it. Showing the button
                and letting the save come back 403 would read as a fault, not a
                rule — the same reason the rate card hides its Edit. */}
            {!isAdmin ? (
              <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
                View only — the mapping is set by an administrator
              </span>
            ) : editingMapping ? (
              <>
                {/* Both Cancels read "Cancel", which is what you want on screen —
                    but the rate editor above has its own and both can be open at
                    once. Two buttons sharing an accessible name is ambiguous when
                    you navigate by button list, so each aria-label says which one
                    it is. Each still starts with the visible word, as WCAG 2.5.3
                    (Label in Name) requires. */}
                <button
                  type="button"
                  onClick={cancelMappingEdit}
                  disabled={saving}
                  aria-label="Cancel mapping changes"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <X size={15} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save size={15} /> {saving ? "Saving…" : "Save mapping"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startMappingEdit}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                <PencilLine size={15} /> Edit mapping
              </button>
            )}
          </div>
        </div>

        <div className="admin-table-wrap">
        <table className="admin-table w-full text-sm">
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
                    <span className="text-xs text-gray-500">—</span>
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
                    disabled={!canEditMapping}
                    className={`rounded px-2 py-1 text-xs w-48 border focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                      canEditMapping
                        ? "border-gray-200 bg-white"
                        : "border-transparent bg-gray-50 text-gray-700 appearance-none"
                    }`}
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
    </div>
  );
}
