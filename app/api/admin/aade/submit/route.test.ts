import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ update: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/sentryReporting", () => ({ reportHandledError: vi.fn() }));
vi.mock("@/lib/aadeXml", () => ({ buildDclXml: () => "<test/>", UnfilableError: class extends Error {} }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: async () => ({ data: true }),
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { id: "test" } }) }) }),
    update: (value: unknown) => { mocks.update(value); return { eq: async () => ({ error: null }) }; },
  }),
} }));
import { POST } from "./route";
beforeEach(() => {
  mocks.update.mockClear(); mocks.fetch.mockReset();
  vi.stubEnv("AADE_USER_ID", "synthetic"); vi.stubEnv("AADE_SUBSCRIPTION_KEY", "synthetic");
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const call = () => POST(new NextRequest("https://staging.invalid/api/admin/aade/submit", { method: "POST", body: JSON.stringify({ id: "test" }) }));
it.each([
  '<ResponseDoc><response><statusCode>XMLSyntaxError</statusCode><errors><error><message>Bad XML</message><code>101</code></error></errors></response></ResponseDoc>',
  '<ResponseDoc><response><statusCode>Success</statusCode></response></ResponseDoc>',
  '<html>Not an AADE response</html>',
  '<ResponseDoc><response><statusCode>Success</statusCode><newClientDclID>42</newClientDclID>',
])("does not mark a HTTP 200 rejection or invalid response submitted", async (xml) => {
  mocks.fetch.mockResolvedValue(new Response(xml));
  expect((await call()).status).toBe(422);
  expect(mocks.update).toHaveBeenCalledWith({ dcl_status: "error" });
  expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ dcl_status: "submitted" }));
});
it("stores the DCL identifier from a successful namespaced response", async () => {
  mocks.fetch.mockResolvedValue(new Response('<d:ResponseDoc xmlns:d="urn:aade"><d:response><d:statusCode>Success</d:statusCode><d:newClientDclID>9007199254740993</d:newClientDclID></d:response></d:ResponseDoc>'));
  const result = await call();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true, mark: "9007199254740993" });
  expect(mocks.update).toHaveBeenCalledWith({ dcl_status: "submitted", dcl_mark: "9007199254740993" });
});
