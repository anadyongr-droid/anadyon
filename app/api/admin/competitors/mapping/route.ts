import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Admin-only via proxy.ts.
export const dynamic = "force-dynamic";

export interface GroupRow {
  competitor: string;
  competitor_label: string;
  car_group: string;
  samples: string[];
  observations: number;
  min_price: number | null;
  max_price: number | null;
  pricing_group: string | null;
}

/** Groups observed in the collected data, with any mapping already assigned. */
export async function GET() {
  const [{ data: rates, error }, { data: map }] = await Promise.all([
    supabaseAdmin
      .from("competitor_rates")
      .select("competitor, competitor_label, car_group, manufacturer, vehicle_name, price_per_day"),
    supabaseAdmin.from("competitor_group_map").select("competitor, car_group, pricing_group"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assigned = new Map(
    (map ?? []).map(m => [`${m.competitor}::${m.car_group}`, m.pricing_group as string | null])
  );

  const grouped = new Map<string, GroupRow>();
  for (const r of rates ?? []) {
    const key = `${r.competitor}::${r.car_group ?? "?"}`;
    let row = grouped.get(key);
    if (!row) {
      row = {
        competitor: r.competitor,
        competitor_label: r.competitor_label,
        car_group: r.car_group ?? "?",
        samples: [],
        observations: 0,
        min_price: null,
        max_price: null,
        pricing_group: assigned.get(key) ?? null,
      };
      grouped.set(key, row);
    }
    row.observations++;

    const name = `${r.manufacturer ?? ""} ${r.vehicle_name ?? ""}`.trim();
    if (name && row.samples.length < 4 && !row.samples.includes(name)) row.samples.push(name);

    const p = r.price_per_day;
    if (typeof p === "number") {
      row.min_price = row.min_price === null ? p : Math.min(row.min_price, p);
      row.max_price = row.max_price === null ? p : Math.max(row.max_price, p);
    }
  }

  const groups = [...grouped.values()].sort(
    (a, b) =>
      a.competitor_label.localeCompare(b.competitor_label) ||
      a.car_group.localeCompare(b.car_group)
  );

  return NextResponse.json({ groups });
}

/** Saves mappings and applies them to the stored observations. */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const mappings: { competitor: string; car_group: string; pricing_group: string | null }[] =
    Array.isArray(body?.mappings) ? body.mappings : [];

  if (!mappings.length) return NextResponse.json({ ok: true, updated: 0 });

  const { error: mapError } = await supabaseAdmin.from("competitor_group_map").upsert(
    mappings.map(m => ({
      competitor: m.competitor,
      car_group: m.car_group,
      pricing_group: m.pricing_group || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "competitor,car_group" }
  );

  if (mapError) return NextResponse.json({ error: mapError.message }, { status: 500 });

  // Denormalise onto the observations so comparison queries stay simple, and so
  // a later re-scrape inherits the decision without re-mapping.
  let updated = 0;
  for (const m of mappings) {
    const value = m.pricing_group && m.pricing_group !== "ignore" ? m.pricing_group : null;
    const { error, count } = await supabaseAdmin
      .from("competitor_rates")
      .update({ pricing_group: value }, { count: "exact" })
      .eq("competitor", m.competitor)
      .eq("car_group", m.car_group);
    if (!error) updated += count ?? 0;
  }

  return NextResponse.json({ ok: true, updated });
}
