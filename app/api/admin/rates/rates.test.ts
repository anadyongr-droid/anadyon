import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Supabase intermittently answers "JWT issued at future". The keys are the newer
 * sb_secret_ format, so the JWT is minted inside Supabase when it exchanges the
 * key — a second of drift between their minting and validating clocks is enough.
 * Nothing here can fix that. These pin what the endpoint does about it.
 */
let attempts = 0;
let failFor = 0;
const RATES = [{ pricing_group: "car_a", rate_1_2: 52 }];

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const result = () => {
        if (table === "rates") {
          attempts++;
          if (attempts <= failFor) {
            return { data: null, error: { message: "JWT issued at future" } };
          }
          return { data: RATES, error: null };
        }
        return { data: [{ key: "fdw", daily_rate: 5 }], error: null };
      };
      chain.select = () => chain;
      chain.order = () => chain;
      chain.then = (r: (v: unknown) => unknown) => r(result());
      return chain;
    },
  },
}));

const { GET } = await import("./route");
const request = (fresh = false) => new NextRequest(`https://anadyon.gr/api/admin/rates${fresh ? "?fresh=1" : ""}`);

beforeEach(() => { attempts = 0; failFor = 0; });

describe("GET /api/admin/rates", () => {
  it("returns the rate card when Supabase is healthy", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).rates).toEqual(RATES);
    expect(attempts).toBe(1);
  });

  it("rides out a single transient rejection", async () => {
    // The observed failure: one bad response, then fine. The customer should
    // never learn this happened.
    failFor = 1;
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).rates).toEqual(RATES);
    expect(attempts).toBe(2);
  });

  it("rides out two", async () => {
    failFor = 2;
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(attempts).toBe(3);
  });

  it("serves a recent card rather than nothing when all attempts fail", async () => {
    await GET(request());        // banks a good card
    attempts = 0; failFor = 99;  // now Supabase is down entirely
    const res = await GET(request());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rates).toEqual(RATES);
    expect(body.stale).toBe(true);
  });

  it("caches a good response but never a stale or failed one", async () => {
    const ok = await GET(request());
    expect(ok.headers.get("cache-control")).toContain("s-maxage=300");
    attempts = 0; failFor = 99;
    const stale = await GET(request());
    expect(stale.headers.get("cache-control")).toBe("no-store");
  });

  it("allows the inline admin editor to request a fresh uncached card", async () => {
    const res = await GET(request(true));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
