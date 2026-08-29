import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every admin button has to say what it is.
 *
 * A button whose only content is an icon component has no text for a screen
 * reader to read, so it is announced as "button" and nothing else. Two of the
 * ones this check first found were the delete buttons on Discount Rules and
 * Promo Codes — an unlabelled X that removes a pricing rule.
 *
 * scripts/check-a11y.mjs cannot catch this: it renders the public pages and no
 * admin screen is in it. Rendering the admin needs a logged-in session, which
 * the harness has no way to produce, so this reads the source instead. That is
 * a weaker check — it proves a name is written, not that the rendered name is
 * useful — but it holds the floor, and the floor is where the failures were.
 *
 * Passing is one of: an `aria-label`, a `title`, or visible text alongside the
 * icon (including `sr-only` text).
 */
const root = new URL("../", import.meta.url).pathname;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * Find the end of an opening `<button` tag.
 *
 * A plain `[^>]*` cannot do this: `onClick={() => remove(id)}` contains a `>`
 * inside the arrow, so the naive form ends the tag in the middle of a handler
 * and reads the rest of it as the button's content. Every one of these buttons
 * has an arrow handler, so the naive scan reported zero problems across the
 * whole admin. Depth-tracking through braces, parens and quotes is what makes
 * the difference between a check and a check that always passes.
 */
function openingTag(src: string, at: number): { attrs: string; end: number } | null {
  let braces = 0;
  let parens = 0;
  let quote: string | null = null;
  const start = at + "<button".length;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
    else if (ch === ">" && braces === 0 && parens === 0) {
      return { attrs: src.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

// Content that is a single icon element, optionally behind a `{cond && …}`.
// No `.` in this pattern, so it needs no `s` flag — `[^>]*` already spans
// newlines. The tsconfig target rejects the flag anyway.
const ICON_ONLY = /^\s*(\{[^{}]*&&\s*)?<[A-Z][A-Za-z0-9]*(\s[^>]*)?\/>\s*\}?\s*$/;

interface Unnamed {
  file: string;
  line: number;
  body: string;
}

function unnamedButtons(): Unnamed[] {
  const found: Unnamed[] = [];
  for (const path of tsxFiles(join(root, "app/admin"))) {
    const src = readFileSync(path, "utf8");
    for (let i = src.indexOf("<button"); i !== -1; i = src.indexOf("<button", i + 1)) {
      const tag = openingTag(src, i);
      if (!tag) continue;
      const close = src.indexOf("</button>", tag.end);
      if (close === -1) continue;
      const body = src.slice(tag.end, close);
      if (body.includes("<button")) continue; // nested — the inner one is checked on its own pass
      if (/aria-label|title=/.test(tag.attrs)) continue;
      if (body.includes("sr-only")) continue;
      if (!ICON_ONLY.test(body)) continue;
      found.push({
        file: path.slice(root.length),
        line: src.slice(0, i).split("\n").length,
        body: body.trim().replace(/\s+/g, " "),
      });
    }
  }
  return found;
}

describe("admin buttons announce themselves", () => {
  it("no icon-only button is left without an accessible name", () => {
    const unnamed = unnamedButtons();
    const listed = unnamed.map((u) => `  ${u.file}:${u.line}  ${u.body}`).join("\n");
    expect(
      unnamed,
      `These buttons contain only an icon, so a screen reader announces "button" ` +
        `and nothing else. Add an aria-label, a title, or sr-only text:\n${listed}`
    ).toEqual([]);
  });

  it("the scanner survives an arrow handler in the attributes", () => {
    // Guarding the guard. The first version of this check used /<button[^>]*>/,
    // which ends the tag at the `>` of `=>` and so found nothing anywhere. If
    // this ever regresses, the check above starts passing vacuously.
    const src = `<button onClick={() => go(1)} className="x"><Icon size={9} /></button>`;
    const tag = openingTag(src, 0);
    expect(tag).not.toBeNull();
    expect(tag!.attrs).toContain("className");
    expect(src.slice(tag!.end, src.indexOf("</button>"))).toBe("<Icon size={9} />");
  });
});
