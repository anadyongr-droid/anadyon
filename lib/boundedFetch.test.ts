import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExternalCallTimeout, TIMEOUTS, boundedFetch } from "./boundedFetch";

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

  const files = SERVER_DIRS.flatMap(walk);

  it("found the server source to check", () => {
    // A guard on the instrument: a walk that silently returns nothing would
    // report a clean sweep over an empty set.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("lib/boundedFetch.ts");
    expect(files.some(f => f.startsWith("app/api/"))).toBe(true);
  });

  const unbounded: string[] = [];

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const lines = text.split("\n");

    lines.forEach((line, i) => {
      if (!/\bfetch\(/.test(line)) return;
      // Comments and doc prose discuss fetch without making a call.
      if (/^\s*(\*|\/\/)/.test(line)) return;
      // `boundedFetch(` contains "fetch(" but is the fix, not a call site.
      if (/boundedFetch\(/.test(line)) return;

      // The init object may be on later lines, so examine the call expression.
      const window = lines.slice(i, i + 14).join("\n");
      if (BOUNDED.some(p => p.test(window))) return;
      if (EXEMPT.some(e => e.file === file && e.match.test(line))) return;

      unbounded.push(`${file}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }

  it("names any unbounded call, because §5.3 states the rule as universal", () => {
    expect(unbounded, `unbounded server-side fetch:\n${unbounded.join("\n")}`).toEqual([]);
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
