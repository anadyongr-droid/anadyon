import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
});

function request(role?: string) {
  return new NextRequest("http://localhost/api/admin/deployment-identity", {
    headers: role ? { "x-anadyon-role": role } : undefined,
  });
}

describe("GET /api/admin/deployment-identity", () => {
  it("refuses callers who were not resolved as administrators", async () => {
    expect((await GET(request())).status).toBe(403);
    expect((await GET(request("staff"))).status).toBe(403);
  });

  it("returns only the three deployment identity fields", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "deadbeef";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://fzycvstifmltxybffinq.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "not-returned";

    const response = await GET(request("admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      commit: "deadbeef",
      environment: "preview",
      supabaseProjectRef: "fzycvstifmltxybffinq",
    });
  });
});
