import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryNeedsAttention, deriveWorkflowStage } from "./emailWorkflowStage";

/**
 * What turns a reservation row red, and what it must not.
 *
 * Red has to stay rare enough to mean "act on this". Two rules that sound
 * reasonable would have destroyed that: flagging anything that is not
 * "delivered" reddens every message during the seconds before the provider
 * confirms, and flagging every unassigned reservation reddens every new website
 * request, since those arrive unallocated by design.
 */
describe("delivery conditions that need attention", () => {
  it("flags the ones a person has to act on", () => {
    for (const status of ["bounced", "complained", "failed", "suppressed", "delayed"]) {
      expect(deliveryNeedsAttention(status), status).toBe(true);
    }
  });

  it("leaves a healthy send alone", () => {
    // All three mean the provider has the message. Reddening "accepted" would
    // flag every email for the moments before delivery is confirmed.
    for (const status of ["accepted", "sent", "delivered"]) {
      expect(deliveryNeedsAttention(status), status).toBe(false);
    }
  });

  it("ignores states that are not a delivery outcome at all", () => {
    for (const status of ["pending", "queued", null, undefined, "", "nonsense"]) {
      expect(deliveryNeedsAttention(status), String(status)).toBe(false);
    }
  });
});

describe("the stage column shows the stage, not the delivery condition", () => {
  const page = readFileSync(new URL("../app/admin/reservations/page.tsx", import.meta.url), "utf8");

  it("renders stageLabel rather than the combined display string", () => {
    // `display` is "Quote Confirmation — Accepted by email provider"; the
    // column wants just "Quote Confirmation".
    expect(page).toContain("workflow.stageLabel");
    expect(page).not.toMatch(/\{workflow\.display\}/);
  });

  it("still derives the condition, because the red rule depends on it", () => {
    expect(page).toContain("workflow.condition");
  });

  it("keeps both labels available to build from", () => {
    const stage = deriveWorkflowStage([
      { kind: "quote_confirmation", status: "accepted", created_at: "2026-08-23T10:00:00Z" },
    ]);
    expect(stage.stageLabel).toBe("Quote Confirmation");
    expect(stage.display).toBe("Quote Confirmation — Accepted by email provider");
  });
});

describe("the reservations list", () => {
  const route = readFileSync(new URL("../app/api/admin/reservations/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/reservations/page.tsx", import.meta.url), "utf8");

  it("returns newest first", () => {
    expect(route).toMatch(/\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
    expect(route).not.toMatch(/\.order\("pickup_date"\)/);
  });

  it("fetches the linked quote so a reference can be shown", () => {
    expect(route).toContain("quotes(ref)");
  });

  it("shows the customer-facing reference, not the raw row id", () => {
    expect(page).toContain("reservationRef(r.id, r.notes, quoteRefOf(r))");
  });

  it("only flags an unassigned vehicle where the system actually tried and failed", () => {
    // source=website + a linked quote means the auto-assignment trigger ran.
    // Office/walk-in rows never go through it, and an ended rental needs no car.
    const rule = page.match(/if \(!r\.vehicle_id[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(rule).toContain("r.quote_id");
    expect(rule).toContain('r.source === "website"');
    expect(rule).toContain("NEEDS_VEHICLE.has(r.status)");
  });

  it("does not treat an ended rental as needing a vehicle", () => {
    const needs = page.match(/const NEEDS_VEHICLE = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
    expect(needs).toContain("pending");
    expect(needs).toContain("confirmed");
    expect(needs).toContain("active");
    for (const ended of ["cancelled", "voided", "no_show", "returned"]) {
      expect(needs, ended).not.toContain(ended);
    }
  });

  it("warns before opening the reservation rather than after", () => {
    expect(page).toContain("window.confirm");
  });
});
