import { describe, expect, it, vi } from "vitest";

// lib/gmail.ts imports lib/supabase.ts, which builds a client from env vars at
// module load. These tests only exercise the pure htmlToText helper.
vi.mock("@/lib/supabase", () => ({ supabase: {}, supabaseAdmin: {} }));

const { htmlToText } = await import("./gmail");

describe("htmlToText", () => {
  it("does not cascade &amp; into a second decode of an already-escaped entity", () => {
    // "&amp;lt;" is literal text meaning "&lt;", not a "<" that needs unescaping again.
    expect(htmlToText("&amp;lt;")).toBe("&lt;");
  });

  it("still decodes ordinary named entities", () => {
    expect(htmlToText("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(htmlToText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
  });

  it("strips a script block whose closing tag has trailing whitespace", () => {
    expect(htmlToText("before<script>alert(1)</script >after")).toBe("before after");
  });

  it("strips a style block whose closing tag has trailing whitespace", () => {
    expect(htmlToText("before<style>.a{}</style >after")).toBe("before after");
  });
});
