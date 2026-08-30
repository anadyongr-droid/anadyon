import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Four eyes on the fleet record: staff propose, an administrator approves.
 *
 * The SQL half — applying, refusing a stale request, rejecting an unwritable
 * column — is executed against a real Postgres in
 * vehicleChangeRequestsMigration.test.ts. What is pinned here is the boundary,
 * because that is where the principle is actually enforced and where a later
 * change could quietly dissolve it.
 *
 * The property that matters: **opening the screen to staff must not widen what
 * staff can write.** The set of fields is unchanged — exactly the ones the
 * route already refused. All that changed is that the refusal now goes into a
 * queue instead of into a 403.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const vehiclePatch = read("app/api/admin/vehicles/[id]/route.ts");
const queue = read("app/api/admin/vehicles/change-requests/route.ts");
const proxy = read("proxy.ts");
const nav = read("app/admin/AdminLayoutClient.tsx");
const fleet = read("app/admin/fleet/page.tsx");
const modal = read("app/admin/components/VehicleModal.tsx");

describe("staff reach the fleet screen", () => {
  it("proxy.ts admits them to the page", () => {
    expect(proxy).toMatch(/"\/admin\/fleet",/);
  });

  it("the nav shows it to them", () => {
    expect(nav).toMatch(/href: "\/admin\/fleet"[^}]*adminOnly: false/);
  });
});

describe("opening the screen did not widen what staff may write", () => {
  it("the writable set is unchanged", () => {
    // status, odometer_km and vehicle_notes were chosen as counter tasks. If a
    // fourth appears here it was added without the review this file is about.
    expect(vehiclePatch).toMatch(
      /STAFF_WRITABLE = new Set\(\["status", "odometer_km", "vehicle_notes"\]\)/
    );
  });

  it("the vehicle route still writes only the permitted fields directly", () => {
    // The refused list must keep being computed from the allowlist, not from
    // the request body.
    expect(vehiclePatch).toMatch(/!isAdmin && !STAFF_WRITABLE\.has\(key\)/);
  });

  it("a proposal is never written to the vehicle by this route", () => {
    // The only thing that writes an approved change is the RPC. If this route
    // ever updates `vehicles` with the refused keys, four eyes becomes two.
    const requestBlock = vehiclePatch.slice(
      vehiclePatch.indexOf("if (refused.length)"),
      vehiclePatch.indexOf("if (!Object.keys(update).length)")
    );
    expect(requestBlock).toMatch(/from\("vehicle_change_requests"\)/);
    expect(requestBlock, "the refused fields are written straight to the vehicle")
      .not.toMatch(/from\("vehicles"\)[\s\S]{0,120}?\.update\(/);
  });
});

describe("only an administrator decides", () => {
  it("PATCH on the queue refuses a staff session", () => {
    // proxy.ts admits staff to /api/admin/vehicles by prefix, so this route is
    // in their reach by default and has to check at the point of use.
    expect(queue).toMatch(/function refuseNonAdmin/);
    expect(queue).toMatch(/export async function PATCH[\s\S]{0,200}?refuseNonAdmin\(req\)/);
  });

  it("GET stays open, so the person who asked can see the verdict", () => {
    const get = queue.slice(queue.indexOf("export async function GET"), queue.indexOf("export async function PATCH"));
    expect(get, "reading the queue was made admin-only too").not.toMatch(/refuseNonAdmin/);
  });

  it("approval goes through the transaction, not a bare update", () => {
    // Marking approved and applying the change cannot be two statements — see
    // the migration. A future 'simplification' to an .update() here would let a
    // request read "approved" over a vehicle that never changed.
    expect(queue).toMatch(/rpc\("apply_vehicle_change_request"/);
    const approveBlock = queue.slice(queue.indexOf('decision === "reject"'));
    expect(approveBlock).not.toMatch(/from\("vehicles"\)[\s\S]{0,120}?\.update\(/);
  });

  it("a rejection cannot overwrite a decision already made", () => {
    expect(queue).toMatch(/\.eq\("status", "pending"\)/);
    expect(queue).toMatch(/already been decided/);
  });

  it("a stale request answers 409, not 500", () => {
    // 40001 is the migration's "the vehicle moved since this was requested".
    // Reporting it as a server error would send somebody looking for a bug.
    expect(queue).toMatch(/error\.code === "40001" \? 409/);
  });
});

describe("nobody is left guessing", () => {
  it("the modal tells staff which fields went for approval", () => {
    expect(modal).toMatch(/_requested/);
    expect(modal).toMatch(/Sent for approval/);
  });

  it("the modal treats 202 as success, not failure", () => {
    // `res.ok` is false for 202, so a naive check would show "Could not save"
    // over a proposal that was recorded perfectly.
    expect(modal).toMatch(/res\.status !== 202/);
  });

  it("the fleet screen shows the queue to everyone", () => {
    expect(fleet).toMatch(/change-requests\?status=pending/);
    expect(fleet).toMatch(/waiting for approval/);
  });

  it("but only offers the buttons to an administrator", () => {
    // Asserted by position rather than by proximity: the first version allowed
    // 600 characters between the guard and the button and failed on correct
    // code at 955, which is the sort of arbitrary bound that gets widened until
    // it means nothing. What matters is that no Approve or Reject control
    // exists ahead of the guard that would render one to staff.
    const guard = fleet.indexOf("{isAdmin && (", fleet.indexOf("waiting for approval"));
    const approve = fleet.indexOf('decide(r.id, "approve")');
    const reject = fleet.indexOf('decide(r.id, "reject")');
    expect(guard, "no isAdmin guard in the approval panel").toBeGreaterThan(-1);
    expect(approve, "the Approve button is outside the isAdmin guard").toBeGreaterThan(guard);
    expect(reject, "the Reject button is outside the isAdmin guard").toBeGreaterThan(guard);
  });

  it("shows before and after, not just the new value", () => {
    // Approving a value without seeing what it replaces is not review.
    expect(fleet).toMatch(/r\.before\[k\]/);
    expect(fleet).toMatch(/r\.changes\[k\]/);
  });
});
