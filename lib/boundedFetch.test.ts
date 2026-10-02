import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExternalCallTimeout, TIMEOUTS, boundedFetch, routeBudget } from "./boundedFetch";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

describe("the budget is honoured", () => {
  it("abandons a call that never answers, and says which one", async () => {
    // A fetch that resolves only when its signal aborts — the shape of the
    // August outage, where the vendor neither answered nor closed the socket.
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      }));

    const err = await boundedFetch("Apify status", "https://example.invalid", {}, 30)
      .then(() => null, (e: unknown) => e);

    expect(err).toBeInstanceOf(ExternalCallTimeout);
    expect((err as ExternalCallTimeout).message).toBe("Apify status did not answer within 30ms");
    vi.unstubAllGlobals();
  });

  it("returns the response untouched when the vendor answers in time", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));
    const res = await boundedFetch("x", "https://example.invalid", {}, 5_000);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    vi.unstubAllGlobals();
  });

  it("passes the caller's init through rather than replacing it", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      seen.push(init);
      return new Response("");
    });
    await boundedFetch("x", "https://example.invalid", {
      method: "POST",
      headers: { "X-Test": "1" },
      body: "payload",
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].body).toBe("payload");
    expect(seen[0].signal).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("reports a caller's own abort as theirs, not as our timeout", async () => {
    // Otherwise an operator closing a page sends someone looking for a slow
    // vendor that was never involved.
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(new Error("caller went away")));
      }));

    const outer = new AbortController();
    const promise = boundedFetch("x", "https://example.invalid", { signal: outer.signal }, 10_000)
      .then(() => null, (e: unknown) => e);
    outer.abort();

    expect(await promise).not.toBeInstanceOf(ExternalCallTimeout);
    vi.unstubAllGlobals();
  });

  it("keeps every budget under Vercel's function ceiling", () => {
    // A timeout longer than the platform's own is not a timeout, it is a
    // comment. maxDuration is 60s on the plan in use.
    for (const [name, ms] of Object.entries(TIMEOUTS)) {
      expect(ms, name).toBeGreaterThan(0);
      expect(ms, name).toBeLessThanOrEqual(30_000);
    }
  });
});

describe("a route-wide budget, because a per-call timeout is not enough alone", () => {
  /** A clock the test drives, so no assertion depends on real elapsed time. */
  function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }

  it("hands out what is left, not what was asked for", () => {
    const c = clock();
    const b = routeBudget(60_000, { reserveMs: 5_000, now: c.now });

    expect(b.forCall(20_000)).toBe(20_000); // plenty left
    c.advance(45_000);
    expect(b.forCall(20_000)).toBe(10_000); // 60 − 5 reserve − 45 elapsed
  });

  it("keeps the reserve back for the write that records what happened", () => {
    // A call allowed to run to the ceiling leaves nothing for the cursor write,
    // which is the silent failure one level in.
    const c = clock();
    const b = routeBudget(60_000, { reserveMs: 5_000, now: c.now });
    c.advance(55_000);
    expect(b.remaining()).toBe(0);
    expect(b.forCall(20_000)).toBe(0);
  });

  it("never goes negative once the ceiling has passed", () => {
    const c = clock();
    const b = routeBudget(60_000, { reserveMs: 3_000, now: c.now });
    c.advance(120_000);
    expect(b.remaining()).toBe(0);
    expect(b.canAfford(1)).toBe(false);
  });

  it("refuses a call too short to be worth starting", () => {
    const c = clock();
    const b = routeBudget(60_000, { reserveMs: 5_000, now: c.now });
    c.advance(53_000);
    expect(b.remaining()).toBe(2_000);
    expect(b.canAfford(2_500)).toBe(false); // skipped honestly
    expect(b.canAfford(2_000)).toBe(true);
  });

  /**
   * The arithmetic from the review finding, replayed.
   *
   * Four EzCar searches with three mandatory 10s crawl delays under a 60s
   * ceiling. With a fixed 20s per call, two slow searches plus their delay
   * reach 60s before the third starts and the platform kills the invocation
   * before the cursor is written. With the shared budget nothing exceeds the
   * ceiling.
   */
  it("keeps the scrape route's worst case inside maxDuration", () => {
    const CEILING = 60_000;
    const DELAY = 10_000;
    const RESERVE = 5_000;
    const MIN_CALL = 2_500;

    const c = clock();
    const b = routeBudget(CEILING, { reserveMs: RESERVE, now: c.now });
    const start = c.now();
    let calls = 0;

    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        if (!b.canAfford(DELAY + MIN_CALL)) break;
        c.advance(DELAY);
      }
      if (!b.canAfford(MIN_CALL)) break;
      // The worst case: every call consumes its whole budget and answers nothing.
      c.advance(b.forCall(20_000));
      calls++;
    }

    const elapsed = c.now() - start;
    expect(elapsed).toBeLessThanOrEqual(CEILING - RESERVE);
    // The reserve is what the cursor write and the response live in.
    expect(CEILING - elapsed).toBeGreaterThanOrEqual(RESERVE);
    // And it does not degenerate into doing nothing on a healthy run.
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("a fixed 20s per call would have overrun, which is why this exists", () => {
    // The control. Same loop, no shared budget — the arithmetic from the finding.
    let elapsed = 0;
    for (let i = 0; i < 4; i++) {
      if (i > 0) elapsed += 10_000;
      elapsed += 20_000;
    }
    expect(elapsed).toBe(110_000);
    expect(elapsed).toBeGreaterThan(60_000);
  });
});

/**
 * The part that makes W27 stay closed.
 *
 * Adding a timeout to nine callers is a morning's work and it is not what was
 * missing — the rule was stated in §5.3 and honoured in four files out of every
 * caller in the codebase, because nothing checked. So this walks the server-side
 * source and fails naming any `fetch(` that is not bounded.
 *
 * Scope is deliberate: **server-side only.** A browser `fetch("/api/…")` is a
 * same-origin call where a hung request costs one spinner in one tab, and the
 * user can reload. An unbounded call inside a serverless function holds the
 * invocation open until the platform kills it, which is the failure §5.3 names.
 */
describe("every server-side fetch in the repository is bounded", () => {
  /** Directories holding code that runs on the server. */
  const SERVER_DIRS = ["lib", "app/api"];

  /**
   * Shapes that count as bounding a call. Several, because the four callers that
   * already got this right each chose a form fitted to what they do next, and
   * rewriting working code to satisfy a test is churn with a regression risk.
   */
  const BOUNDED = [
    // `signal: x`, and the shorthand `{ signal, … }` / `{ …init, signal }` that
    // `healthChecks.ts` and this module itself use. The trailing punctuation is
    // what keeps it from matching prose about signals.
    /\bsignal\s*[:,}]/,
    /boundedFetch\(/,          // this module
    /AbortSignal\.timeout\(/,  // the runtime's own one-liner
  ];

  /**
   * Lines the rule does not reach, each with the reason it does not.
   *
   * An allowlist rather than a looser pattern: a named exemption is reviewable
   * in a diff and a loose regex is not.
   */
  const EXEMPT: { file: string; match: RegExp; because: string }[] = [
    {
      file: "lib/farosRates.ts",
      match: /fetch\('includes\/ajax\.php'/,
      because:
        "a string evaluated in Apify's own browser, not a call this process " +
        "makes. Bounded by the Actor's pageFunctionTimeoutSecs, which that file " +
        "sets to 180. Matched on the line, not the file: the same module makes " +
        "three real Apify calls that are this rule's business.",
    },
  ];

  function walk(dir: string): string[] {
    const abs = join(ROOT, dir);
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return [];
    }
    return entries.flatMap(name => {
      const full = join(abs, name);
      if (statSync(full).isDirectory()) return walk(relative(ROOT, full));
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
      return [relative(ROOT, full)];
    });
  }

  /**
   * The text of one `fetch(…)` call, parenthesis-balanced from the opening
   * bracket.
   *
   * An earlier draft of this scanner read a fixed 14-line window after the match
   * instead, and the review bot on #190 was right that it is unsound: a bare
   * `fetch(url)` immediately followed by a *different*, properly bounded call
   * would pass, because the second call's `signal` sat inside the first's
   * window. That is not a hypothetical — it is the shape code takes when a new
   * unbounded caller is added next to an existing good one, which is exactly the
   * regression this test exists to catch.
   *
   * Quoted strings and template literals are skipped so a bracket inside a URL
   * or a `${…}` cannot unbalance the count. Returns null when the brackets never
   * close, which is treated as unbounded rather than quietly passed.
   */
  function callExpression(text: string, openParen: number): string | null {
    let depth = 0;
    let quote: string | null = null;

    for (let i = openParen; i < text.length; i++) {
      const c = text[i];

      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return text.slice(openParen, i + 1);
      }
    }
    return null;
  }

  /** Blanks string and template literals, keeping length so nothing shifts. */
  function withoutStrings(expr: string): string {
    let out = "";
    let quote: string | null = null;

    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (quote) {
        if (c === "\\") {
          out += "  ";
          i++;
          continue;
        }
        if (c === quote) quote = null;
        out += c === quote ? c : " ";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        out += c;
        continue;
      }
      out += c;
    }
    return out;
  }

  /** Every unbounded `fetch(` in one file's source, as `line: text` pairs. */
  function unboundedIn(text: string, exemptions: RegExp[] = []): { line: number; text: string }[] {
    const found: { line: number; text: string }[] = [];
    const call = /\bfetch\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = call.exec(text))) {
      const at = m.index;
      const lineStart = text.lastIndexOf("\n", at) + 1;
      const lineText = text.slice(lineStart, text.indexOf("\n", at) === -1 ? undefined : text.indexOf("\n", at));

      // Comments and doc prose discuss fetch without making a call.
      if (/^\s*(\*|\/\/)/.test(lineText)) continue;
      // `boundedFetch(` contains "fetch(" but is the fix, not a call site.
      if (/boundedFetch\s*\($/.test(text.slice(0, at + m[0].length))) continue;
      if (exemptions.some(e => e.test(lineText))) continue;

      const expr = callExpression(text, text.indexOf("(", at));
      // Matched against the call with its string literals removed. The fixture
      // below is why: a URL containing `signal:` satisfied the pattern and
      // cleared a bare call, which is the same class of false pass as the window
      // scanner this replaced — a token that looks like the fix but is data.
      if (expr && BOUNDED.some(p => p.test(withoutStrings(expr)))) continue;

      found.push({
        line: text.slice(0, at).split("\n").length,
        text: lineText.trim().slice(0, 90),
      });
    }
    return found;
  }

  const files = SERVER_DIRS.flatMap(walk);

  it("found the server source to check", () => {
    // A guard on the instrument: a walk that silently returns nothing would
    // report a clean sweep over an empty set.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("lib/boundedFetch.ts");
    expect(files.some(f => f.startsWith("app/api/"))).toBe(true);
  });

  describe("the scanner itself, against fixtures rather than the repository", () => {
    it("clears a call that carries a signal", () => {
      expect(unboundedIn(`await fetch(url, { signal: ctrl.signal });`)).toEqual([]);
      expect(unboundedIn(`await fetch(url, { ...init, signal });`)).toEqual([]);
      expect(unboundedIn(`await fetch(u, { signal: AbortSignal.timeout(5) });`)).toEqual([]);
    });

    it("flags a bare call", () => {
      expect(unboundedIn(`const r = await fetch(url);`)).toHaveLength(1);
    });

    /**
     * The control the review bot asked for, and the reason the window scanner was
     * replaced. This is the arrangement a careless addition actually produces.
     */
    it("flags a bare call that is followed by a bounded one", () => {
      const src = [
        `async function a() {`,
        `  const r = await fetch(first);`,
        `  return r.text();`,
        `}`,
        `async function b() {`,
        `  const r = await fetch(second, { signal: AbortSignal.timeout(100) });`,
        `  return r.text();`,
        `}`,
      ].join("\n");

      const found = unboundedIn(src);
      expect(found).toHaveLength(1);
      expect(found[0].line).toBe(2);
      expect(found[0].text).toContain("first");
    });

    it("is not fooled by a bracket or a signal inside a string", () => {
      // A URL carrying `)` or the word signal must not close the expression
      // early or satisfy the pattern.
      expect(unboundedIn('await fetch("https://x/a)b?signal:1");')).toHaveLength(1);
      expect(unboundedIn('await fetch(`${base}/p(1)`);')).toHaveLength(1);
    });

    it("spans the lines a real multi-line call occupies", () => {
      const src = [
        `const res = await fetch(url, {`,
        `  method: "POST",`,
        `  headers: { "Content-Type": "application/json" },`,
        `  body: payload,`,
        `  signal: AbortSignal.timeout(8_000),`,
        `});`,
      ].join("\n");
      expect(unboundedIn(src)).toEqual([]);
    });

    it("treats a call whose brackets never close as unbounded", () => {
      expect(unboundedIn(`await fetch(url, { method: "GET"`)).toHaveLength(1);
    });
  });

  const unbounded = files.flatMap(file => {
    const text = readFileSync(join(ROOT, file), "utf8");
    const exemptions = EXEMPT.filter(e => e.file === file).map(e => e.match);
    return unboundedIn(text, exemptions).map(u => `${file}:${u.line} ${u.text}`);
  });

  it("names any unbounded call, because §5.3 states the rule as universal", () => {
    expect(unbounded, `unbounded server-side fetch:\n${unbounded.join("\n")}`).toEqual([]);
  });

  /**
   * A route that makes several calls has to draw them from one budget, and the
   * sweep above cannot see that: every call in it is individually bounded.
   * Asserted against the source, with imports stripped so the assertion is about
   * use rather than presence.
   */
  describe("the multi-call route draws from one budget", () => {
    const raw = readFileSync(
      join(ROOT, "app/api/admin/competitors/scrape/route.ts"),
      "utf8",
    );
    const route = raw.replace(/^import[\s\S]*?from\s+"[^"]*";$/gm, "");

    it("builds a budget from its own declared ceiling", () => {
      // Hardcoding 60_000 would silently decouple from `maxDuration` the moment
      // somebody changed it, which is how this class of bug arrives.
      expect(route).toMatch(/routeBudget\(maxDuration \* 1_000/);
    });

    it("spends it on every call it makes, not just the searches", () => {
      const spends = route.match(/budget\.forCall\(/g) ?? [];
      expect(spends.length).toBeGreaterThanOrEqual(3);
    });

    it("stops rather than starting a call it cannot finish", () => {
      expect(route).toMatch(/budget\.canAfford\(/);
      expect(route).toMatch(/break;/);
    });

    it("counts the crawl delay against the budget, not only the calls", () => {
      // The sleeps are half the ceiling; a budget that ignored them would still
      // overrun.
      expect(route).toMatch(/canAfford\(CRAWL_DELAY_MS/);
    });

    it("writes the cursor after the loop, so a short batch still records progress", () => {
      const loopEnd = route.indexOf("results.push(await runScrapeTask");
      const cursorWrite = route.indexOf("await writeCursor(", loopEnd);
      expect(cursorWrite).toBeGreaterThan(loopEnd);
    });
  });

  it("states a reason for each exemption rather than listing a path", () => {
    // An allowlist with no reasons becomes a place to put anything awkward.
    for (const e of EXEMPT) {
      expect(e.because.length, e.file).toBeGreaterThan(60);
      expect(files, e.file).toContain(e.file);
      // An exemption for a line that no longer exists is a dead one, and it
      // would silently cover whatever moved onto that line next.
      const text = readFileSync(join(ROOT, e.file), "utf8");
      expect(e.match.test(text), `${e.file}: exemption matches nothing`).toBe(true);
    }
  });
});
