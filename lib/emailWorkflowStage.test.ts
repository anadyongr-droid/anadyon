import { describe, expect, it } from "vitest";
import { deriveWorkflowStage } from "./emailWorkflowStage";

const at = (n: number) => `2026-08-2${n}T10:00:00Z`;

describe("customer email workflow stage", () => {
  it("is absent until something has actually been dispatched", () => {
    expect(deriveWorkflowStage([]).stage).toBeNull();
    expect(deriveWorkflowStage(null).stage).toBeNull();
    expect(deriveWorkflowStage([
      { kind: "acknowledgment", status: "pending", created_at: at(1) },
    ]).stage).toBeNull();
  });

  it("does not let a queued or failed email look sent", () => {
    expect(deriveWorkflowStage([
      { kind: "acknowledgment", status: "queued", created_at: at(1) },
    ])).toMatchObject({ stage: null, display: null });

    expect(deriveWorkflowStage([
      { kind: "booking_confirmation", status: "failed", created_at: at(2) },
    ])).toMatchObject({ stage: null, display: null });
  });

  it("advances through the three stages in order", () => {
    const rows = [{ kind: "acknowledgment", status: "delivered", created_at: at(1) }];
    expect(deriveWorkflowStage(rows)).toMatchObject({
      stage: "acknowledgment", display: "Acknowledged",
    });

    rows.push({ kind: "quote_confirmation", status: "delivered", created_at: at(2) });
    expect(deriveWorkflowStage(rows).stage).toBe("quote_confirmation");

    rows.push({ kind: "booking_confirmation", status: "delivered", created_at: at(3) });
    expect(deriveWorkflowStage(rows)).toMatchObject({
      stage: "booking_confirmation", display: "Booking confirmed",
    });
  });

  it("takes the furthest stage regardless of the order rows arrive in", () => {
    expect(deriveWorkflowStage([
      { kind: "booking_confirmation", status: "delivered", created_at: at(1) },
      { kind: "acknowledgment", status: "delivered", created_at: at(3) },
    ]).stage).toBe("booking_confirmation");
  });

  it("shows the delivery condition beside the stage rather than hiding it", () => {
    // The case that matters: the office must not read "Booking confirmed" and
    // assume the customer has it.
    expect(deriveWorkflowStage([
      { kind: "acknowledgment", status: "delivered", created_at: at(1) },
      { kind: "booking_confirmation", status: "bounced", created_at: at(2) },
    ])).toMatchObject({
      stage: "booking_confirmation",
      condition: "bounced",
      display: "Booking confirmed — Bounced",
    });

    expect(deriveWorkflowStage([
      { kind: "quote_confirmation", status: "delayed", created_at: at(1) },
    ]).display).toBe("Quote Confirmation — Delivery delayed");

    expect(deriveWorkflowStage([
      { kind: "quote_confirmation", status: "accepted", created_at: at(1) },
    ]).display).toBe("Quote Confirmation — Accepted by email provider");
  });

  it("uses the most recent attempt of the furthest stage, so a resend supersedes a bounce", () => {
    expect(deriveWorkflowStage([
      { kind: "quote_confirmation", status: "bounced", created_at: at(1) },
      { kind: "quote_confirmation", status: "delivered", created_at: at(3) },
    ])).toMatchObject({ stage: "quote_confirmation", condition: "delivered", display: "Quote Confirmation" });
  });

  it("ignores kinds it does not recognise", () => {
    expect(deriveWorkflowStage([
      { kind: "marketing_blast", status: "delivered", created_at: at(1) },
    ]).stage).toBeNull();
  });
});
