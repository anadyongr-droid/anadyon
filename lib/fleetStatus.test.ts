import { describe, it, expect } from "vitest";
import { vehicleDateStatuses, rentalBar, computeMargin } from "./fleetStatus";

const TODAY = new Date("2026-08-17T00:00:00");
/** A date `n` days from TODAY, built in local time so no timezone shift creeps in. */
const day = (n: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("the statutory dates are not equal in consequence", () => {
  it("bars the vehicle when KTEO has expired, because cover is void", () => {
    const r = rentalBar(
      { kteo_expiry: day(-5), insurance_expiry: day(200), road_tax_paid_until: day(100) },
      TODAY
    );
    expect(r.barred).toBe(true);
    expect(r.reason).toMatch(/insurance cover is void/i);
  });

  it("bars the vehicle when insurance has expired", () => {
    const r = rentalBar({ kteo_expiry: day(200), insurance_expiry: day(-1) }, TODAY);
    expect(r.barred).toBe(true);
  });

  it("does NOT bar for expired road tax — that is a fine, not a prohibition", () => {
    const r = rentalBar(
      { kteo_expiry: day(200), insurance_expiry: day(200), road_tax_paid_until: day(-30) },
      TODAY
    );
    expect(r.barred).toBe(false);
  });

  it("does not bar when nothing is recorded — absence is not expiry", () => {
    expect(rentalBar({}, TODAY).barred).toBe(false);
  });
});

describe("status overrides paperwork", () => {
  it.each(["maintenance", "retired"])("bars a %s vehicle even with valid papers", (status) => {
    const r = rentalBar(
      { status, kteo_expiry: day(200), insurance_expiry: day(200) },
      TODAY
    );
    expect(r.barred).toBe(true);
  });

  it("allows an available vehicle with valid papers", () => {
    const r = rentalBar(
      { status: "available", kteo_expiry: day(200), insurance_expiry: day(200) },
      TODAY
    );
    expect(r.barred).toBe(false);
  });
});

describe("day counting is taken from local midnight", () => {
  // new Date() carries a time. Subtracting without normalising made "expires
  // today" read as expired from mid-morning, and shifted every count by one for
  // part of the day.
  it.each(["00:00", "09:30", "13:00", "23:59"])(
    'reports "expires today" at %s, not expired',
    (time) => {
      const now = new Date(`2026-08-17T${time}:00`);
      const kteo = vehicleDateStatuses({ kteo_expiry: "2026-08-17" }, now)
        .find(s => s.key === "kteo_expiry")!;
      expect(kteo.severity).toBe("due-soon");
      expect(kteo.daysRemaining).toBe(0);
    }
  );

  it("counts exactly either side of today from a mid-afternoon now", () => {
    const now = new Date("2026-08-17T15:22:00");
    const at = (d: string) =>
      vehicleDateStatuses({ kteo_expiry: d }, now).find(s => s.key === "kteo_expiry")!.daysRemaining;
    expect(at("2026-08-16")).toBe(-1);
    expect(at("2026-08-18")).toBe(1);
    expect(at("2026-09-16")).toBe(30);
  });
});

describe("statuses are ordered worst first", () => {
  it("puts expired above due-soon above unknown above ok", () => {
    const s = vehicleDateStatuses(
      { kteo_expiry: day(-5), insurance_expiry: day(10), road_tax_paid_until: day(300) },
      TODAY
    );
    expect(s.map(x => x.severity)).toEqual(["expired", "due-soon", "unknown", "ok"]);
  });
});

describe("margin", () => {
  it("counts only the damage the business absorbed", () => {
    // Damage charged to the customer is recovered and must not count against
    // the vehicle.
    const m = computeMargin({ revenue: 4200, costs: 900, absorbedDamage: 150 });
    expect(m.costs).toBe(1050);
    expect(m.margin).toBe(3150);
    expect(m.marginPct).toBe(75);
  });

  it("returns null rather than zero when there is no revenue", () => {
    // A percentage of nothing misleads — it would render as "0% margin" on a
    // vehicle that simply has not been rented yet.
    const m = computeMargin({ revenue: 0, costs: 300, absorbedDamage: 0 });
    expect(m.marginPct).toBeNull();
    expect(m.costRatio).toBeNull();
    expect(m.margin).toBe(-300);
  });
});
