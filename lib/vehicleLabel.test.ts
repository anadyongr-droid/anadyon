import { describe, it, expect } from "vitest";
import { vehicleLabel, normalisePlate } from "./vehicleLabel";

describe("vehicleLabel", () => {
  it("joins the model and the plate for staff", () => {
    expect(vehicleLabel({ name: "Hyundai i20", plate: "IOZ-4176" })).toBe("Hyundai i20 — IOZ-4176");
  });
  it("falls back to the model alone where there is no plate", () => {
    expect(vehicleLabel({ name: "Cinzia Retro Men", plate: null })).toBe("Cinzia Retro Men");
    expect(vehicleLabel({ name: "Cinzia Retro Men" })).toBe("Cinzia Retro Men");
  });
});

describe("normalisePlate", () => {
  it("converts Greek capitals to their identical-looking Latin twins", () => {
    // Typed on a Greek keyboard; indistinguishable on screen, unsearchable in fact.
    expect(normalisePlate("ΖΑΖ-9892")).toBe("ZAZ-9892");
    expect(normalisePlate("ΙΟΗ-8395")).toBe("IOH-8395");
    expect(normalisePlate("IOΕ-2356")).toBe("IOE-2356");
  });
  it("leaves an already-Latin plate alone", () => {
    expect(normalisePlate("IOZ-4176")).toBe("IOZ-4176");
  });
  it("settles on one separator", () => {
    expect(normalisePlate("HBI 1560")).toBe("HBI-1560");
    expect(normalisePlate("HBI  -  1560")).toBe("HBI-1560");
  });
  it("handles the Rho and Upsilon that do not map to their lookalikes", () => {
    expect(normalisePlate("ΡΥΧ-1234")).toBe("PYX-1234");
  });
  it("returns null for nothing", () => {
    expect(normalisePlate("")).toBeNull();
    expect(normalisePlate(null)).toBeNull();
    expect(normalisePlate("  -  ")).toBeNull();
  });
});
