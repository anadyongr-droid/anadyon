import type { PricingGroup } from "@/lib/pricing";

/**
 * The one description of what Anadyon rents.
 *
 * Model, vehicle type, pricing group and transmission were previously declared
 * three times over — once per vehicle page — and passed to the booking form as
 * props, which meant the browser told the server which pricing group to charge.
 * A crafted request could name an expensive model with a cheap group and the
 * server had nothing to check it against.
 *
 * Everything now derives from this table. The public pages render from it, and
 * the quote route looks the submitted model up here rather than trusting the
 * submitted group, type or transmission. A model that is not listed cannot be
 * priced at all — see `resolveModel`.
 */

export type VehicleTypeName = "Cars" | "Motorbikes" | "Bikes";

/** Matches the vehicles.transmission check constraint. NULL for bicycles. */
export type Transmission = "Manual" | "Automatic";

export interface CatalogueModel {
  /** Exactly as displayed and as stored on the quote. */
  readonly name: string;
  readonly vehicleType: VehicleTypeName;
  readonly pricingGroup: PricingGroup;
  /** Null for bicycles, which have no transmission to substitute across. */
  readonly transmission: Transmission | null;
}

export const VEHICLE_CATALOGUE: readonly CatalogueModel[] = [
  { name: "Fiat Panda", vehicleType: "Cars", pricingGroup: "car_a", transmission: "Manual" },
  { name: "Hyundai Getz", vehicleType: "Cars", pricingGroup: "car_a", transmission: "Manual" },
  { name: "Hyundai i10", vehicleType: "Cars", pricingGroup: "car_a", transmission: "Manual" },
  { name: "Hyundai i20", vehicleType: "Cars", pricingGroup: "car_b", transmission: "Manual" },
  { name: "Peugeot 107", vehicleType: "Cars", pricingGroup: "car_c", transmission: "Automatic" },

  { name: "Kymco Agility 50cc", vehicleType: "Motorbikes", pricingGroup: "motorbike_a", transmission: "Automatic" },
  { name: "Kymco Agility 125cc", vehicleType: "Motorbikes", pricingGroup: "motorbike_b", transmission: "Automatic" },

  { name: "Cinzia Bombi Retro Women", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "Cinzia Bombi Retro Men", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "Scott Sportster 50", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "Ideal Crossmo", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "Kona Lanai", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "KTM Manhattan XC", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
  { name: "Specialized Ariel", vehicleType: "Bikes", pricingGroup: "bike", transmission: null },
] as const;

/**
 * Loose enough to survive a stray double space or a different case from an old
 * cached page, strict enough that it still has to be a real model. It is a
 * lookup key only — the stored name always comes from the catalogue entry, so
 * a near-miss cannot write a variant spelling into the database.
 */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const BY_NAME = new Map(VEHICLE_CATALOGUE.map((model) => [normalise(model.name), model]));

/**
 * The submitted model, or null if it is not one we rent.
 *
 * Callers must treat null as a rejection rather than falling back to a default
 * group: pricing an unknown model against `car_a` would quietly sell a car at
 * a bicycle's price, and pricing it against nothing produced a €0 quote that
 * still looked accepted.
 */
export function resolveModel(name: string | null | undefined): CatalogueModel | null {
  if (typeof name !== "string" || !name.trim()) return null;
  return BY_NAME.get(normalise(name)) ?? null;
}

/** Every model of one vehicle type, in display order. */
export function modelsForType(vehicleType: VehicleTypeName): readonly CatalogueModel[] {
  return VEHICLE_CATALOGUE.filter((model) => model.vehicleType === vehicleType);
}

/** Model name → pricing group, for the booking form's live price panel. */
export function pricingGroupsForType(vehicleType: VehicleTypeName): Record<string, PricingGroup> {
  return Object.fromEntries(
    modelsForType(vehicleType).map((model) => [model.name, model.pricingGroup]),
  );
}
