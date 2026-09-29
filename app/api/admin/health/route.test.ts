import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const runHealthChecks = vi.fn();
vi.mock("@/lib/healthChecks", () => ({ runHealthChecks: () => runHealthChecks() }));

const { GET } = await import("./route");

function request(role?: string) {
  return new NextRequest("http://localhost/api/admin/health", {
    headers: role ? { "x-anadyon-role": role } : undefined,
  });
}

beforeEach(() => {
  runHealthChecks.mockReset();
});

describe("GET /api/admin/health", () => {
  it("refuses callers who were not resolved as administrators", async () => {
    runHealthChecks.mockResolvedValue([]);
    expect((await GET(request())).status).toBe(403);
    expect((await GET(request("staff"))).status).toBe(403);
    // The checks reach production, so a refused caller must not trigger them.
    expect(runHealthChecks).not.toHaveBeenCalled();
  });

  it("returns every check and counts the failing ones", async () => {
    runHealthChecks.mockResolvedValue([
      { name: "Recent database backup", ok: false, detail: "newest is 3 days old" },
      { name: "Rate card readable", ok: true, detail: "12 rows" },
      { name: "Mail DNS hardening", ok: false, detail: "no DMARC" },
    ]);

    const response = await GET(request("admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.failing).toBe(2);
    expect(body.checks).toHaveLength(3);
    expect(body.checks[0]).toEqual({
      name: "Recent database backup",
      ok: false,
      detail: "newest is 3 days old",
    });
    expect(Date.parse(body.ranAt)).not.toBeNaN();
  });

  it("reports a healthy system as zero failing rather than as empty", async () => {
    runHealthChecks.mockResolvedValue([{ name: "Rate card readable", ok: true, detail: "12 rows" }]);
    const body = await (await GET(request("admin"))).json();
    // A caller that only reads `failing` must still see the checks ran, so an
    // all-clear is distinguishable from a run that produced nothing.
    expect(body.failing).toBe(0);
    expect(body.checks).toHaveLength(1);
  });
});
