"use client";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import {
  computeTargetRates,
  monthsPresent,
  summariseProposals,
  summariseSkips,
  type ComparisonRow,
  type Proposal,
  type TargetResult,
} from "@/lib/targetPricing";

/**
 * "Be 2% cheaper than Faros for all October rentals."
 *
 * **This panel never writes a price.** `DEFINING-STATEMENTS.md` §13 puts prices
 * first on the list of things an agent may draft but not deploy without Tasos's
 * explicit approval of the specific change, so the flow deliberately ends one
 * step short: Preview computes, Apply fills the rate editor's drafts, and the
 * Save that already exists on this screen is the only thing that writes. There
 * is no `fetch` in this file and `lib/targetPricingUi.test.ts` fails if one
 * appears.
 *
 * The arithmetic all lives in `lib/targetPricing.ts` rather than here, because
 * a rule written inside a component can only be tested by rendering one — and
 * this project's Vitest runs in `node` with no DOM.
 */

/** Rounding is settled, not configurable — Tasos: "rather 18.5". */
const ROUND_TO = 0.5;

interface Props {
  rows: ComparisonRow[];
  competitors: { slug: string; label: string }[];
  /** Fills the rate editor's drafts. Saving stays the operator's own action. */
  onApply: (proposals: Proposal[]) => void | Promise<void>;
  disabled?: boolean;
}

export default function RepricingPanel({ rows, competitors, onApply, disabled }: Props) {
  const months = useMemo(() => monthsPresent(rows), [rows]);

  const [competitor, setCompetitor] = useState("");
  const [percent, setPercent] = useState("2");
  const [direction, setDirection] = useState<"cheaper" | "dearer">("cheaper");
  // Empty means every month, which is what the engine already does with an
  // empty list — so the two agree without the component restating the rule.
  const [chosen, setChosen] = useState<number[]>([]);
  const [result, setResult] = useState<TargetResult | null>(null);
  const [applying, setApplying] = useState(false);

  const magnitude = Number(percent);
  const validPercent = Number.isFinite(magnitude) && magnitude >= 0;
  const deltaPct = direction === "cheaper" ? -magnitude : magnitude;
  const spec = { competitor, deltaPct, months: chosen, roundTo: ROUND_TO };

  function toggleMonth(month: number) {
    setResult(null);
    setChosen(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  }

  function preview() {
    setResult(computeTargetRates(rows, spec));
  }

  async function apply() {
    if (!result?.proposals.length) return;
    setApplying(true);
    await onApply(result.proposals);
    setApplying(false);
  }

  const competitorLabel =
    competitors.find(c => c.slug === competitor)?.label ?? "the competitor";

  return (
    <section
      aria-labelledby="repricing-heading"
      className="bg-white rounded-xl border border-gray-200 mb-6"
    >
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Target size={16} className="text-blue-600" aria-hidden="true" />
        <h2 id="repricing-heading" className="font-semibold text-gray-900 text-sm">
          Reprice against a competitor
        </h2>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">
            <span className="block mb-1 font-medium">Competitor</span>
            <select
              value={competitor}
              onChange={e => { setCompetitor(e.target.value); setResult(null); }}
              disabled={disabled}
              className="min-h-10 w-52 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            >
              <option value="">— choose —</option>
              {competitors.map(c => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600">
            <span className="block mb-1 font-medium">Percent</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={percent}
              onChange={e => { setPercent(e.target.value); setResult(null); }}
              disabled={disabled}
              className="min-h-10 w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            />
          </label>

          <label className="text-xs text-gray-600">
            {/* Two controls rather than one signed field. A minus sign that
                decides whether every price on the card goes up or down is too
                easy to lose in a number input. */}
            <span className="block mb-1 font-medium">Direction</span>
            <select
              value={direction}
              onChange={e => { setDirection(e.target.value as "cheaper" | "dearer"); setResult(null); }}
              disabled={disabled}
              className="min-h-10 w-44 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
            >
              <option value="cheaper">cheaper than them</option>
              <option value="dearer">more than them</option>
            </select>
          </label>

          <button
            type="button"
            onClick={preview}
            disabled={disabled || !competitor || !validPercent}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-700 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
          >
            Preview
          </button>
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-gray-600 mb-1.5">
            Months {chosen.length === 0 && <span className="font-normal">— none chosen means all</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {months.length === 0 ? (
              <span className="text-xs text-gray-500">No months to reprice yet.</span>
            ) : months.map(m => (
              <label
                key={m.month}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                  chosen.includes(m.month)
                    ? "border-blue-600 bg-blue-50 text-blue-800 font-medium"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(m.month)}
                  onChange={() => toggleMonth(m.month)}
                  disabled={disabled}
                  className="h-3.5 w-3.5"
                />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-gray-500">
          Prices are rounded to the nearest €{ROUND_TO.toFixed(2)}. Nothing is written until you
          press Save Rates.
        </p>

        {result && <Preview result={result} spec={spec} competitorLabel={competitorLabel} />}

        {result && result.proposals.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={disabled || applying}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {applying ? "Filling in…" : "Fill in the rate editor"}
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              disabled={applying}
              className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Preview({
  result,
  spec,
  competitorLabel,
}: {
  result: TargetResult;
  spec: { competitor: string; deltaPct: number; months: number[]; roundTo: number };
  competitorLabel: string;
}) {
  const tallies = summariseSkips(result.skipped);

  return (
    <div className="rounded-lg border border-gray-200">
      <p className="border-b border-gray-100 px-4 py-2 text-sm font-medium text-gray-900">
        {summariseProposals(result, spec)}
      </p>

      {result.proposals.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Group</th>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 text-left font-medium">Duration</th>
                <th className="px-3 py-2 text-right font-medium">{competitorLabel}</th>
                <th className="px-3 py-2 text-right font-medium">Now</th>
                <th className="px-4 py-2 text-right font-medium">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {result.proposals.map(p => (
                <tr key={`${p.rateId}-${p.field}`} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-700">{p.pricingGroup}</td>
                  <td className="px-3 py-2 text-gray-700">{p.monthName}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.bandLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    €{p.competitor.toFixed(2)}
                    {/* Faros enforces a three-day minimum, so their 1–2 day
                        figure is their 3-day rate ÷ 3. Tasos chose to reprice
                        off it; a reader is still never shown a synthetic number
                        as though it were a quote. */}
                    {p.proxy && (
                      <span
                        title="Their 3-day rate used as a proxy — they have a three-day minimum"
                        className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                      >
                        proxy
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    €{p.current.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                    €{p.proposed.toFixed(2)}
                    <span
                      className={`ml-2 text-xs font-normal ${
                        p.change < 0 ? "text-amber-700" : p.change > 0 ? "text-blue-700" : "text-gray-500"
                      }`}
                    >
                      {p.change > 0 ? "+" : ""}
                      {p.change.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tallies.length > 0 && (
        <ul className="border-t border-gray-100 px-4 py-2 text-xs text-gray-600">
          {/* Skips are counted rather than hidden. A group missing from a
              repricing looks identical to one deliberately left alone, and the
              difference matters when the output is a price list. */}
          {tallies.map(t => (
            <li key={t.reason}>
              {t.count} {t.count === 1 ? "row" : "rows"} skipped — {t.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
