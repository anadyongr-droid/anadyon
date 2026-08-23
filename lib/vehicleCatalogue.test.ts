import { describe, expect, it } from "vitest";
import { VEHICLE_CATALOGUE, modelsForType, pricingGroupsForType, resolveModel } from "./vehicleCatalogue";

describe("vehicle catalogue", () => {
  it("resolves a model to its canonical group, type and transmission", () => {
    expect(resolveModel("Peugeot 107")).toEqual({
      name: "Peugeot 107", vehicleType: "Cars", pricingGroup: "car_c", transmission: "Automatic",
    });
    expect(resolveModel("Hyundai i20")?.pricingGroup).toBe("car_b");
    expect(resolveModel("Kymco Agility 125cc")?.pricingGroup).toBe("motorbike_b");
    expect(resolveModel("Kona Lanai")).toMatchObject({ pricingGroup: "bike", transmission: null });
  });

  it("tolerates whitespace and case but not a different model", () => {
    expect(resolveModel("  hyundai   i20 ")?.name).toBe("Hyundai i20");
    expect(resolveModel("Hyundai i21")).toBeNull();
    expect(resolveModel("")).toBeNull();
    expect(resolveModel(null)).toBeNull();
    expect(resolveModel(undefined)).toBeNull();
  });

  it("has no duplicate names, since a lookup must be unambiguous", () => {
    const names = VEHICLE_CATALOGUE.map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every car and motorbike a transmission and every bicycle none", () => {
    for (const model of VEHICLE_CATALOGUE) {
      if (model.vehicleType === "Bikes") expect(model.transmission).toBeNull();
      else expect(model.transmission).toMatch(/^(Manual|Automatic)$/);
    }
  });

  it("groups models by type for the public pages", () => {
    expect(modelsForType("Motorbikes").map((m) => m.name)).toEqual([
      "Kymco Agility 50cc", "Kymco Agility 125cc",
    ]);
    expect(pricingGroupsForType("Cars")).toMatchObject({
      "Fiat Panda": "car_a", "Hyundai i20": "car_b", "Peugeot 107": "car_c",
    });
  });
});
