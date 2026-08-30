import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The wiring that makes a major damage actually stop a booking.
 *
 * The policy is covered by damageBlock.test.ts. What is checked here is that it
 * reaches the one mechanism that can enforce it.
 *
 * **`rentalBar()` is not that mechanism.** It renders a warning on three
 * screens. The thing that refuses to allocate a vehicle is the SQL allocator in
 * `20260828120000_vehicle_blocks.sql`, which reads `vehicle_blocks`. A future
 * change that "simplifies" this by teaching rentalBar about damage and dropping
 * the block insert would leave a red line on the fleet screen while the website
 * carried on taking bookings — so the block insert is what is pinned.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const ledger = read("app/api/admin/vehicles/[id]/ledger/route.ts");
const blocks = read("app/api/admin/vehicles/blocks/route.ts");
const modal = read("app/admin/components/VehicleModal.tsx");
const briefing = read("app/api/cron/morning-briefing/route.ts");
const allocator = read("supabase/migrations/20260828120000_vehicle_blocks.sql");

describe("recording major damage takes the vehicle off the road", () => {
  it("opens a vehicle_blocks row, which is what the allocator reads", () => {
    expect(ledger).toMatch(/shouldOpenBlock\(/);
    expect(ledger).toMatch(/from\("vehicle_blocks"\)[\s\S]{0,400}?\.insert\(/);
    expect(ledger).toMatch(/reason: "damage"/);
  });

  it("the allocator really does consult vehicle_blocks", () => {
    // Guarding the premise. If this stops being true the block insert above is
    // decoration, and this whole feature is a warning label.
    expect(allocator).toMatch(/from public\.vehicle_blocks b/);
  });

  it("does not open a second block for an already-blocked vehicle", () => {
    // Two open damage blocks would each need releasing separately, so a second
    // dent would quietly double the work of putting the car back.
    expect(ledger).toMatch(/\.eq\("reason", "damage"\)[\s\S]{0,120}?\.is\("released_at", null\)/);
  });

  it("a failed block does not lose the damage record", () => {
    // The operator typed the damage; that is the part worth keeping. Failing
    // the request would discard it and teach people not to log damage at all.
    expect(ledger).toMatch(/_block_error/);
    expect(ledger, "the block failure aborts the whole insert")
      .not.toMatch(/blockErr[\s\S]{0,80}?return NextResponse\.json\([\s\S]{0,60}?status: 500/);
  });
});

describe("only an administrator puts it back", () => {
  it("refuses a staff release of a damage block", () => {
    expect(blocks).toMatch(/releaseNeedsAdmin\(existing\.reason\)/);
    expect(blocks).toMatch(/!== "admin"/);
    expect(blocks).toMatch(/status: 403/);
  });

  it("reads the reason, or it cannot know which blocks are protected", () => {
    // The original select was `id, released_at`. Without `reason` the guard
    // reads undefined and never fires — a check that always passes.
    expect(blocks).toMatch(/\.select\("id, reason, released_at"\)/);
  });

  it("still lets staff release every other kind", () => {
    // §7.4's reasoning holds for a van back from the mechanic. The narrowing is
    // to damage only, and lib/damageBlock.ts is where that list lives.
    expect(blocks).not.toMatch(/reason !== "maintenance"/);
  });
});

describe("the operator is told, and the administrator is reminded", () => {
  it("the modal says the vehicle came off the road", () => {
    // A consequence nobody was told about reads as a fault when a booking will
    // not allocate later.
    expect(modal).toMatch(/_blocked/);
    expect(modal).toMatch(/out of the active fleet/i);
  });

  it("the modal says loudly when the block failed", () => {
    expect(modal).toMatch(/_block_error/);
    expect(modal).toMatch(/still bookable/i);
  });

  it("the briefing lists damage holds separately from other blocks", () => {
    // A van at the mechanic is somebody's errand. A car held for damage is a
    // decision waiting on one person, and it waits until that person sees it.
    expect(briefing).toMatch(/reason === "damage"/);
    expect(briefing).toContain("ΜΟΝΟ ΔΙΑΧΕΙΡΙΣΤΗΣ");
  });

  it("lists them from day one, not at the chase threshold", () => {
    // blockChase() stays quiet for the first two days. That is right for a
    // workshop estimate and wrong for something only one person can clear.
    expect(briefing).toMatch(/damageHeldAll = \(openBlocks \?\? \[\]\)\.filter/);
  });
});
