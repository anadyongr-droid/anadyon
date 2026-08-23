import { describe, expect, it, vi } from "vitest";

// lib/podilatadikoRates.ts imports lib/supabase.ts, which builds a client from
// env vars at module load. These tests only exercise the pure stripTags helper.
vi.mock("@/lib/supabase", () => ({ supabase: {}, supabaseAdmin: {} }));

const { stripTags } = await import("./podilatadikoRates");

describe("stripTags", () => {
  it("does not cascade &amp; into a second decode of an already-escaped entity", () => {
    expect(stripTags("&amp;quot;")).toBe("&quot;");
  });

  it("still decodes ordinary named/numeric entities", () => {
    expect(stripTags("Rock &amp; Roll")).toBe("Rock & Roll");
    expect(stripTags("&#8217;curved&#8217;")).toBe("'curved'");
  });
});
