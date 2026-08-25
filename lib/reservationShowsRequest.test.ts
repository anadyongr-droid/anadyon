import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const root = new URL("../", import.meta.url).pathname;
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

  it("every column it embeds actually exists on quotes", () => {
    // This is the assertion that was missing. The first version of this test
    // only checked the STRING appeared in the select, so it passed while the
    // embed named return_date / return_time — columns the quotes table does
    // not have. PostgREST rejects the whole embed in that case, so the panel,
    // the dropdown filtering and the substitution warnings all silently
    // disappeared. The quote uses dropoff_*; the reservation uses return_*.
    const baseline = readFileSync(join(root, "supabase/migrations/001_baseline.sql"), "utf8");
    const quotesDdl = baseline.slice(
      baseline.indexOf("CREATE TABLE IF NOT EXISTS quotes"),
    );
    const quotesBody = quotesDdl.slice(0, quotesDdl.indexOf("\n);"));
    const quoteColumns = new Set(
      [...quotesBody.matchAll(/^\s+([a-z_]+)\s+(?:text|uuid|numeric|integer|int|boolean|date|timestamptz)/gm)]
        .map(m => m[1]),
    );
    // plus anything a later migration added
    for (const m of [...baseline.matchAll(/add column (?:if not exists )?([a-z_]+)/gi)]) quoteColumns.add(m[1]);

    const embed = route.match(/quotes\(([^)]*)\)/)?.[1] ?? "";
    expect(embed, "quotes embed not found").not.toBe("");
    const embedded = embed.split(",").map(c => c.trim()).filter(Boolean);
    expect(embedded.length).toBeGreaterThan(5);

    const missing = embedded.filter(c => !quoteColumns.has(c));
    expect(missing, `embedded but not on the quotes table: ${missing.join(", ")}`).toEqual([]);
  });

  it("includes the dates the customer asked for", () => {
    for (const field of ["pickup_date", "pickup_time", "dropoff_date", "dropoff_time", "rental_days"]) {
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
