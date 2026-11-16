import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], ilike: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ ilike: mocks.ilike }) }) }) } }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
import { POST } from "./route";
const row = { id: "p1", code: "SUMMER", type: "fixed", value: 5, expires_at: null, max_uses: null, used_count: 0, description: "test", active: true };
beforeEach(() => {
  mocks.rows = [row];
  // Support both the old single-row query and the corrected bounded query.
  mocks.ilike.mockImplementation(() => Object.assign(Promise.resolve({ data: mocks.rows, error: null }), { maybeSingle: () => Promise.resolve({ data: mocks.rows[0], error: null }) }));
});
async function validate(code: string) {
  return (await POST(new NextRequest("https://example.invalid/api/promo/validate", { method: "POST", body: JSON.stringify({ code }) }))).json();
}
it("rejects a wildcard result without revealing the matched code or value", async () => {
  const result = await validate("______");
  expect(result.valid).toBe(false);
  expect(result.code).toBeUndefined();
  expect(result.value).toBeUndefined();
});
it("accepts an exact match ignoring case", async () => {
  expect(await validate("summer")).toMatchObject({ valid: true, code: "SUMMER", value: 5 });
});
it("selects the exact row when the query returns multiple rows", async () => {
  mocks.rows = [{ ...row, id: "other", code: "VIPX10", value: 99 }, { ...row, code: "VIP_10" }];
  expect(await validate("vip_10")).toMatchObject({ valid: true, id: "p1", value: 5 });
});
