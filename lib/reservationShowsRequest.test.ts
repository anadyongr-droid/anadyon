import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The customer's request has to reach the screen where a vehicle is allocated.
 *
 * `quoted` was a prop, and only the Quotes screen supplied it. Opening the same
 * modal from the Reservations list or the reservation detail page passed
 * nothing — so the vehicle dropdown was not filtered to eligible vehicles, no
 * substitution warning could fire, the "customer requested this change"
 * checkbox never appeared, and staff could not see what had been booked.
 *
 * Nothing unsafe could be *saved* — `validateQuoteVehicleAssignment` re-checks
 * against the database on write — but every piece of guidance was missing from
 * the one workflow that needs it.
 */
const modal = readFileSync(new URL("../app/admin/components/ReservationModal.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/reservations/[id]/route.ts", import.meta.url), "utf8");

describe("the reservation carries its quote", () => {
  it("the GET embeds the linked quote", () => {
    const select = route.match(/\.select\("\*, vehicles\([^"]*"\)/)?.[0] ?? "";
    expect(select, "reservation select not found").not.toBe("");
    expect(select).toContain("quotes(");
  });

  it("it includes what is needed to judge an assignment", () => {
    // Without these three, isEligibleAssignment and checkSubstitution have
    // nothing to compare against and silently return "ok".
    for (const field of ["pricing_group", "transmission", "selected_model", "vehicle_type"]) {
      expect(route, field).toContain(field);
    }
  });

  it("includes the dates the customer asked for", () => {
    // Allocating a vehicle without the requested window is guesswork, and when
    // staff have already moved the booking the difference is the whole point.
    for (const field of ["pickup_date", "pickup_time", "return_date", "return_time", "rental_days"]) {
      expect(route, field).toContain(field);
    }
  });

  it("and what staff need to read", () => {
    for (const field of ["driver_age", "baby_seat", "child_seat", "additional_drivers", "comments"]) {
      expect(route, field).toContain(field);
    }
  });
});

describe("the modal uses it wherever it was opened from", () => {
  it("resolves the request from the prop or the loaded quote", () => {
    // The prop still wins: the Quotes screen passes it while converting, before
    // any reservation exists to load a quote from.
    expect(modal).toMatch(/const request = quoted \?\? loadedQuote \?\? undefined;/);
  });

  it("filters the vehicle list against the resolved request, not the prop", () => {
    expect(modal).toContain("isEligibleAssignment(request");
    expect(modal).not.toContain("isEligibleAssignment(quoted");
  });

  it("checks substitution against the resolved request, not the prop", () => {
    expect(modal).toContain("checkSubstitution(request ?? {}");
    expect(modal).not.toContain("checkSubstitution(quoted ?? {}");
  });

  it("shows the requested dates, and flags when the reservation has moved", () => {
    expect(modal).toContain("Requested:");
    expect(modal).toContain("the reservation now differs");
    // The comparison must be against the live form values, not the stored ones.
    expect(modal).toMatch(/loadedQuote\.pickup_date !== form\.pickup_date/);
  });

  it("shows the request on screen rather than only using it for logic", () => {
    expect(modal).toContain("Customer&rsquo;s original request");
    // Guarded, so a walk-in with no quote shows no empty panel.
    expect(modal).toMatch(/\{request && \(/);
  });
});
