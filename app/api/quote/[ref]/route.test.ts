import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ report: vi.fn(), rpc: vi.fn().mockResolvedValue({ error: { message: "missing function" } }) }));
vi.mock("@/lib/sentryReporting", () => ({ reportHandledError: mocks.report }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null, error: { message: "not found" } }) }) }) }),
} }));
import { GET } from "./route";
it("reports a tracking fault without changing the public 404 or attaching identity", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await GET(new NextRequest("https://example.invalid/api/quote/MISSING?surname=Private"), { params: Promise.resolve({ ref: "MISSING" }) });
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not found" });
  expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), "quote", "lookup-failure-tracking");
  expect(mocks.report.mock.calls[0][0].message).toBe("Quote lookup failure tracking failed");
  vi.restoreAllMocks();
});
