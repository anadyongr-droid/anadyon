import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Discount rules and promo codes are what customers are actually charged.
 *
 * Both screens listed them with a 20px unlabelled circle that PATCHed the
 * database on a single tap — no confirmation, no undo, and nothing written down
 * afterwards saying it had happened. Turning a live early-bird rule off is a
 * pricing change; it should not be reachable by a mis-tap on a phone.
 *
 * Three things were wrong with that one control:
 *
 *   1. It wrote immediately. Everything else consequential on these screens
 *      asks first — `confirm("Delete this rule?")` was already right there.
 *   2. The target was `w-5 h-5`. The rate card's buttons are held to `min-h-11`
 *      (44px) by lib/ratesEditGate.test.ts, and this is the control most likely
 *      to be hit by accident.
 *   3. It had no accessible name, and an *inactive* toggle rendered an entirely
 *      empty button — `{r.active && <Check/>}` puts nothing inside it. A screen
 *      reader announced "button" and nothing else. The static a11y check cannot
 *      see this because it does not render admin pages.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const screens = [
  { name: "discount rules", src: read("app/admin/discount-rules/page.tsx"), ref: "r.name" },
  { name: "promo codes", src: read("app/admin/promo-codes/page.tsx"), ref: "c.code" },
];

describe.each(screens)("$name: the active toggle asks before it writes", ({ src, ref }) => {
  it("confirms before sending the PATCH", () => {
    // The confirm has to gate the fetch, not merely appear somewhere in the
    // file — handleDelete already has one, so a bare /confirm\(/ proves nothing.
    expect(src).toMatch(
      /async function toggleActive\([\s\S]{0,400}?if \(!confirm\([\s\S]{0,200}?\)\) return;[\s\S]{0,200}?method: "PATCH"/
    );
  });

  it("the question names which way it is about to go", () => {
    // "Are you sure?" on a toggle tells you nothing — you cannot tell from it
    // whether you are switching something on or off.
    expect(src).toMatch(/toggleActive\([\s\S]{0,400}?\.active \? "Turn off" : "Turn on"/);
  });

  it("the question names the thing being changed", () => {
    // ${r.name} / ${c.code} — the row's own identifier, interpolated into the
    // question, so it names the rule you are about to change and not just "this".
    expect(src).toMatch(
      new RegExp(`toggleActive\\([\\s\\S]{0,500}?\\$\\{${ref.replace(".", "\\.")}\\}`)
    );
  });
});

describe.each(screens)("$name: the toggle can be hit and can be heard", ({ src }) => {
  it("meets the 44px touch-target minimum", () => {
    expect(src, "the 20px w-5 h-5 target is still there")
      .toMatch(/min-h-11 min-w-11/);
  });

  it("is a switch, not an anonymous button", () => {
    expect(src).toMatch(/role="switch"/);
    expect(src).toMatch(/aria-checked=\{/);
  });

  it("carries a name even when it is empty", () => {
    // The failure mode: `{active && <Check/>}` renders nothing at all when the
    // row is inactive, so the button has no content to derive a name from.
    expect(src).toMatch(/aria-label=\{/);
  });
});
