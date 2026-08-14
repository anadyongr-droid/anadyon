import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const [{ data: reservations }, { data: quotes }] = await Promise.all([
    supabaseAdmin.from("reservations").select("id, customer_name, customer_email, customer_phone, customer_nationality, created_at, status"),
    supabaseAdmin.from("quotes").select("ref, first_name, last_name, email, mobile_tel, country, created_at"),
  ]);

  // Build a map keyed by email (lowercased), keeping the most recent interaction
  const map = new Map<string, {
    key: string;
    name: string;
    email: string;
    phone: string;
    nationality: string;
    last_interaction: string;
    interaction_count: number;
    sources: string[];
  }>();

  for (const r of reservations ?? []) {
    const key = (r.customer_email ?? r.customer_phone ?? r.customer_name).toLowerCase();
    const existing = map.get(key);
    if (!existing || r.created_at > existing.last_interaction) {
      map.set(key, {
        key,
        name: r.customer_name,
        email: r.customer_email ?? "",
        phone: r.customer_phone ?? "",
        nationality: r.customer_nationality ?? "",
        last_interaction: r.created_at,
        interaction_count: (existing?.interaction_count ?? 0) + 1,
        sources: [...(existing?.sources ?? []), `reservation:${r.id}`],
      });
    } else {
      existing.interaction_count += 1;
      existing.sources.push(`reservation:${r.id}`);
    }
  }

  for (const q of quotes ?? []) {
    const key = (q.email ?? q.mobile_tel ?? `${q.first_name} ${q.last_name}`).toLowerCase();
    const existing = map.get(key);
    if (!existing || q.created_at > existing.last_interaction) {
      map.set(key, {
        key,
        name: `${q.first_name} ${q.last_name}`,
        email: q.email ?? "",
        phone: q.mobile_tel ?? "",
        nationality: q.country ?? "",
        last_interaction: q.created_at,
        interaction_count: (existing?.interaction_count ?? 0) + 1,
        sources: [...(existing?.sources ?? []), `quote:${q.ref}`],
      });
    } else {
      existing.interaction_count += 1;
      existing.sources.push(`quote:${q.ref}`);
    }
  }

  const clients = Array.from(map.values()).sort((a, b) =>
    b.last_interaction.localeCompare(a.last_interaction)
  );

  return NextResponse.json(clients);
}
