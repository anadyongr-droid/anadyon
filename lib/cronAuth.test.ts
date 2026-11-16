import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const runWatchdog = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/emailSync", () => ({ runWatchdog }));
import { GET } from "@/app/api/cron/watchdog/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("refuses Bearer undefined before doing any work when the secret is absent", async () => {
  vi.stubEnv("CRON_SECRET", undefined);
  const res = await GET(new NextRequest("https://example.invalid/api/cron/watchdog", { headers: { authorization: "Bearer undefined" } }));
  expect(res.status).toBe(401);
  expect(runWatchdog).not.toHaveBeenCalled();
});

import { isAuthorisedCron } from "./cronAuth";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
it.each([undefined, "", " ", "\t"])("fails closed for empty configuration: %s", (secret) => {
  vi.stubEnv("CRON_SECRET", secret);
  expect(isAuthorisedCron("Bearer undefined")).toBe(false);
  expect(isAuthorisedCron("Bearer ")).toBe(false);
});
it("accepts only the exact bearer bytes", () => {
  expect(isAuthorisedCron("Bearer s3cret-value", "s3cret-value")).toBe(true);
  for (const header of [null, "bearer s3cret-value", "Bearer s3cret-valuE", "Bearer s3cret-value ", "Bearer short"])
    expect(isAuthorisedCron(header, "s3cret-value")).toBe(false);
  expect(isAuthorisedCron("Bearer x", "x")).toBe(true);
  expect(isAuthorisedCron("Bearer padded", " padded ")).toBe(false);
  expect(isAuthorisedCron("Bearer  padded ", " padded ")).toBe(true);
});
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? routes(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : []);
}
it("uses the shared guard in every cron route without reading a secret in route code", () => {
  const files = routes("app/api/cron");
  expect(files.length).toBe(3);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('isAuthorisedCron(req.headers.get("authorization"))');
    expect(source).not.toContain("process.env.CRON_SECRET");
  }
});
