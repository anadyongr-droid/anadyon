import { describe, expect, it } from "vitest";
import {
  isMatchable,
  reconcile,
  type AuditedSend,
  type Listing,
  type ReconciliationInput,
} from "./reconcile";

const NOW = 1_700_000_000_000;
const GRACE = 5 * 60 * 1000;

const sent = (over: Partial<AuditedSend> = {}): AuditedSend => ({
  idempotencyKey: "k1",
  userId: "office-1",
  senderAddress: "customerservice@anadyon.gr",
  correlationId: "zm-1",
  at: NOW - GRACE - 1000,
  ...over,
});

const listed = (...ids: string[]): Listing => ({
  listed: true,
  messages: ids.map((correlationId) => ({ correlationId, at: NOW })),
});

const failed = (reason = "IMAP timeout"): Listing => ({ listed: false, reason });

const input = (over: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  audited: [sent()],
  zohoSent: listed("zm-1"),
  officeCopies: listed("zm-1"),
  now: NOW,
  graceMs: GRACE,
  ...over,
});

describe("the healthy case, so the rest means something", () => {
  it("reports ok when a send is in both listings", () => {
    const report = reconcile(input());
    expect(report.status).toBe("ok");
    expect(report.matched).toBe(1);
    expect(report.summary).toContain("OK");
    expect(report.inconclusiveBecause).toEqual([]);
  });
});

describe("HIGH 2 itself: a send the office never received", () => {
  it("is diverged, and names it rather than counting it", () => {
    const report = reconcile(input({ officeCopies: listed() }));
    expect(report.status).toBe("diverged");
    expect(report.missingFromOffice).toHaveLength(1);
    expect(report.missingFromOffice[0].idempotencyKey).toBe("k1");
    expect(report.summary).toContain("never reached the office record");
  });

  it("separates the worse case — audited as sent but absent from Zoho's own Sent folder", () => {
    const report = reconcile(input({ zohoSent: listed(), officeCopies: listed() }));
    expect(report.status).toBe("diverged");
    expect(report.missingFromZohoSent).toHaveLength(1);
    expect(report.missingFromOffice).toHaveLength(0);
  });

  it("reports divergence even when part of the picture is missing", () => {
    const report = reconcile(input({ officeCopies: listed(), zohoSent: failed() }));
    expect(report.status).toBe("diverged");
    expect(report.missingFromOffice).toHaveLength(1);
    // The incompleteness is still recorded; it just does not soften the finding.
    expect(report.inconclusiveBecause.join(" ")).toContain("Zoho Sent");
  });
});

describe("an empty comparison is never an all-clear", () => {
  it("is inconclusive when nothing was sent, because a quiet night and a broken audit store look alike", () => {
    const report = reconcile(input({ audited: [] }));
    expect(report.status).toBe("inconclusive");
    expect(report.matched).toBe(0);
    expect(report.summary).toContain("not an all-clear");
    expect(report.inconclusiveBecause.join(" ")).toContain("quiet period");
  });

  it("is inconclusive when a listing failed, and does not treat it as an empty mailbox", () => {
    const report = reconcile(input({ officeCopies: failed("token expired") }));
    expect(report.status).toBe("inconclusive");
    expect(report.missingFromOffice).toEqual([]);
    expect(report.inconclusiveBecause.join(" ")).toContain("token expired");
  });

  it("distinguishes a failed listing from a genuinely empty one", () => {
    expect(reconcile(input({ officeCopies: failed() })).status).toBe("inconclusive");
    expect(reconcile(input({ officeCopies: listed() })).status).toBe("diverged");
  });

  it("is inconclusive when every send is unmatchable, rather than ok", () => {
    const report = reconcile(input({ audited: [sent({ correlationId: "unidentified:k1" })] }));
    expect(report.status).toBe("inconclusive");
    expect(report.unmatchable).toHaveLength(1);
    expect(report.summary).toContain("no usable correlation id");
  });

  it("treats an empty correlation id as unmatchable too", () => {
    expect(isMatchable("")).toBe(false);
    expect(isMatchable("unidentified:anything")).toBe(false);
    expect(isMatchable("zm-1")).toBe(true);
  });

  it("never reports ok with zero matches, whatever else is in the window", () => {
    for (const over of [
      { audited: [] },
      { audited: [sent({ correlationId: "unidentified:k1" })] },
      { zohoSent: failed(), officeCopies: failed() },
      { audited: [sent({ at: NOW })] },
    ] as Partial<ReconciliationInput>[]) {
      const report = reconcile(input(over));
      expect(report.status).not.toBe("ok");
    }
  });
});

describe("the grace period distinguishes 'not yet' from 'missing'", () => {
  it("holds a send younger than the grace period as pending, not diverged", () => {
    const report = reconcile(input({ audited: [sent({ at: NOW - 1000 })], officeCopies: listed() }));
    expect(report.status).toBe("inconclusive");
    expect(report.pending).toHaveLength(1);
    expect(report.missingFromOffice).toEqual([]);
  });

  it("stops holding it once the grace period has passed", () => {
    const report = reconcile(input({ audited: [sent({ at: NOW - GRACE - 1 })], officeCopies: listed() }));
    expect(report.status).toBe("diverged");
    expect(report.pending).toEqual([]);
  });

  it("counts a pending send in the ok summary without letting it prove anything", () => {
    const report = reconcile(input({ audited: [sent(), sent({ idempotencyKey: "k2", correlationId: "zm-2", at: NOW })] }));
    expect(report.status).toBe("ok");
    expect(report.matched).toBe(1);
    expect(report.pending).toHaveLength(1);
    expect(report.summary).toContain("too recent to judge");
  });
});

describe("the canary is what makes a quiet period checkable", () => {
  const canary = "canary-7";

  it("passes when the probe is in both listings", () => {
    const report = reconcile(
      input({
        audited: [sent({ idempotencyKey: "canary", correlationId: canary, at: NOW })],
        zohoSent: listed(canary),
        officeCopies: listed(canary),
        canaryCorrelationId: canary,
      }),
    );
    expect(report.status).toBe("ok");
  });

  it("is diverged when the probe never reached the office, even if nothing else did either", () => {
    const report = reconcile(
      input({
        audited: [sent({ idempotencyKey: "canary", correlationId: canary, at: NOW })],
        zohoSent: listed(canary),
        officeCopies: listed(),
        canaryCorrelationId: canary,
      }),
    );
    expect(report.status).toBe("diverged");
    expect(report.summary).toContain("canary never reached the office record");
  });

  it("is not softened by the grace period, because the run made the send itself", () => {
    const report = reconcile(
      input({
        audited: [sent({ correlationId: canary, at: NOW })],
        zohoSent: listed(canary),
        officeCopies: listed(),
        canaryCorrelationId: canary,
      }),
    );
    expect(report.status).toBe("diverged");
    expect(report.pending).toEqual([]);
  });

  it("is diverged when the probe was made but never audited, which indicts the audit store", () => {
    const report = reconcile(
      input({ audited: [], zohoSent: listed(canary), officeCopies: listed(canary), canaryCorrelationId: canary }),
    );
    expect(report.status).toBe("diverged");
    expect(report.summary).toContain("never audited");
  });
});

describe("a copy nobody can account for", () => {
  it("is counted, because it means something other than the bridge is sending", () => {
    const report = reconcile(input({ officeCopies: listed("zm-1", "stranger-1", "stranger-2") }));
    expect(report.unexplainedOfficeCopies).toBe(2);
    // Not a divergence: the office mailbox legitimately receives mail from
    // elsewhere. It is a number to watch, not an alert on its own.
    expect(report.status).toBe("ok");
  });

  it("counts nothing when the office listing failed", () => {
    expect(reconcile(input({ officeCopies: failed() })).unexplainedOfficeCopies).toBe(0);
  });
});

describe("the summary is safe to put in an alert", () => {
  it("never says OK unless the status is ok", () => {
    for (const over of [{ audited: [] }, { officeCopies: listed() }, { zohoSent: failed() }] as Partial<ReconciliationInput>[]) {
      const report = reconcile(input(over));
      expect(report.summary.startsWith("OK")).toBe(false);
    }
  });

  it("carries no subject, body or recipient address — only what the audit row holds", () => {
    const report = reconcile(input({ officeCopies: listed() }));
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain("guest@");
    expect(serialised).toContain("customerservice@anadyon.gr");
  });
});
