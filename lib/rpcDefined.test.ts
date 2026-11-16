import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? sources(path) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [path] : [];
  });
}
it("every literal application RPC has a versioned function definition", () => {
  const called = new Set(sources("app").concat(sources("lib")).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/\.rpc\s*\(\s*["'`]([a-z_0-9]+)["'`]/gi)].map((m) => m[1])));
  expect(called.size).toBeGreaterThanOrEqual(13);
  const sql = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join("supabase/migrations", f), "utf8").replace(/--[^\n]*/g, "")).join("\n");
  const defined = new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi)].map((m) => m[1]));
  expect([...called].filter((name) => !defined.has(name)), "RPCs missing migrations").toEqual([]);
});
