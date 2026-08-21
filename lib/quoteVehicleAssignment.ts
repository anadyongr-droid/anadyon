import { supabaseAdmin } from "@/lib/supabase";
import { checkSubstitution, isEligibleAssignment, type Assigned, type Quoted } from "@/lib/substitution";

type Result = { error: string; status: number } | null;

/**
 * Server-side guard for a vehicle allocated to a website quote.
 *
 * The select box is only a convenience. This function is the boundary that
 * prevents a crafted request, a stale browser tab, or a future admin screen
 * from turning a car request into a bike or crossing Manual/Automatic.
 */
export async function validateQuoteVehicleAssignment(
  quoteId: string | null | undefined,
  vehicleId: string | null | undefined,
): Promise<Result> {
  if (!quoteId || !vehicleId) return null;

  const [{ data: quote, error: quoteError }, { data: vehicle, error: vehicleError }] = await Promise.all([
    supabaseAdmin
      .from("quotes")
      .select("pricing_group, vehicle_type, transmission, selected_model")
      .eq("id", quoteId)
      .maybeSingle(),
    supabaseAdmin
      .from("vehicles")
      .select("pricing_group, category, transmission, status, name")
      .eq("id", vehicleId)
      .maybeSingle(),
  ]);

  if (quoteError || !quote) {
    return { status: 400, error: "The linked quote could not be found for this reservation." };
  }
  if (vehicleError || !vehicle) {
    return { status: 400, error: "The selected vehicle could not be found." };
  }
  if (vehicle.status !== "available") {
    return { status: 400, error: "The selected vehicle is not available for allocation." };
  }

  const quoted: Quoted = {
    pricing_group: quote.pricing_group,
    vehicle_type: quote.vehicle_type,
    transmission: quote.transmission,
    model: quote.selected_model,
  };
  const assigned: Assigned = {
    pricing_group: vehicle.pricing_group,
    category: vehicle.category,
    transmission: vehicle.transmission,
    name: vehicle.name,
  };

  if (isEligibleAssignment(quoted, assigned)) return null;

  const substitution = checkSubstitution(quoted, assigned);
  return {
    status: 400,
    error: substitution.verdict === "downgrade"
      ? `${substitution.message} This screen only offers same-category vehicles and free upgrades; record customer consent before arranging a downgrade.`
      : substitution.message || "This vehicle is not eligible for the customer's quoted category.",
  };
}
