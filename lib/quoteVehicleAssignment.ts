import { supabaseAdmin } from "@/lib/supabase";
import { checkSubstitution, consentCanPermit, isEligibleAssignment, type Assigned, type Quoted } from "@/lib/substitution";

type Result = { error: string; status: number } | null;

/**
 * Server-side guard for a vehicle allocated to a website quote.
 *
 * The select box is only a convenience. This function is the boundary that
 * prevents a crafted request, a stale browser tab, or a future admin screen
 * from turning a car request into a bike or crossing Manual/Automatic.
 *
 * `customerRequested` is the one thing that changes the answer: a customer
 * ringing up to ask for an automatic, or to accept a smaller car, is not a
 * substitution being done to them. The messages here already told staff to
 * "agree the change with them first" while giving them no way to say they had.
 * It permits only what a customer can actually agree to — never a car booking
 * becoming a bicycle, and never a transmission the fleet record does not hold.
 */
export async function validateQuoteVehicleAssignment(
  quoteId: string | null | undefined,
  vehicleId: string | null | undefined,
  customerRequested = false,
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

  // The customer asked for this. Permitted only where consent is the actual
  // missing ingredient — a different transmission, or a lower category they
  // have accepted. A bicycle against a car booking, or a vehicle with no
  // recorded transmission, stays refused however the box is ticked.
  if (customerRequested && consentCanPermit(substitution)) return null;

  return {
    status: 400,
    error: substitution.verdict === "downgrade"
      ? `${substitution.message} Tick "the customer requested this change" to record their agreement.`
      : consentCanPermit(substitution)
        ? `${substitution.message} If they asked for it, tick "the customer requested this change" to record their agreement.`
        : substitution.message || "This vehicle is not eligible for the customer's quoted category.",
  };
}
